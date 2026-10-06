import { SandboxNodeData, SandboxConnection } from './sandboxTypes';
import { Recipe, IntermediateRecipe, Machine } from '../../types';

type RuntimeFields = 'actualCycleTime' | 'efficiency' | 'actualPower' | 'actualGoblins' | 'fluidSaturation' | 'solidSaturation';

/** 節點規格：執行期欄位可省略，省略時由 makeNode 依額定參數補齊 */
export type NodeSpec = Omit<SandboxNodeData, RuntimeFields> & Partial<Pick<SandboxNodeData, RuntimeFields>>;

/**
 * 建立沙盒節點：執行期欄位預設為「額定滿載」狀態
 * （actualCycleTime = baseCycleTime、actualPower = basePowerConsumption、actualGoblins = baseGoblins、
 *  efficiency = 1、流體/固體滿足率 = 1）；spec 中明確給定的欄位一律優先。
 *  鍵序固定為「額定欄位 → 執行期欄位 → inputs / outputs / statusNote」，確保重新產生的藍圖 JSON 位元組穩定。
 */
export function makeNode(spec: NodeSpec): SandboxNodeData {
  const {
    actualCycleTime, efficiency, actualPower, actualGoblins, fluidSaturation, solidSaturation,
    inputs, outputs, statusNote, ...rest
  } = spec;
  const node: SandboxNodeData = {
    ...rest,
    actualCycleTime: 'actualCycleTime' in spec ? actualCycleTime! : spec.baseCycleTime,
    efficiency: 'efficiency' in spec ? efficiency! : 1.0,
    actualPower: 'actualPower' in spec ? actualPower! : spec.basePowerConsumption,
    actualGoblins: 'actualGoblins' in spec ? actualGoblins! : spec.baseGoblins,
    fluidSaturation: 'fluidSaturation' in spec ? fluidSaturation! : 1.0,
    solidSaturation: 'solidSaturation' in spec ? solidSaturation! : 1.0,
    inputs,
    outputs,
  };
  if ('statusNote' in spec) node.statusNote = statusNote;
  return node;
}

/**
 * 校準節點額定產能：收割機/採掘機恆為 5 秒 1 份；其餘機台依食譜/中間配方資料重設
 * baseOutputCount 與 baseCycleTime（防止舊版快取或藍圖殘留膨脹產能倍率）。
 */
export function calibrateNodeBaseRates(
  n: SandboxNodeData,
  recipes: Recipe[],
  intermediate: IntermediateRecipe[]
): SandboxNodeData {
  let correctedBaseOutputCount = n.baseOutputCount;
  let correctedBaseCycleTime = n.baseCycleTime;
  if (n.type === 'machine') {
    if (n.machineName === '收割機' || n.machineName === '採掘機') {
      correctedBaseOutputCount = 1;
      correctedBaseCycleTime = 5;
    } else if (n.recipeName) {
      const rec = recipes.find(r => r.name === n.recipeName);
      const inter = intermediate.find(r => r.name === n.recipeName);
      if (rec) {
        correctedBaseOutputCount = rec.outputCount || 1;
        correctedBaseCycleTime = rec.cycleTime || 5;
      } else if (inter) {
        correctedBaseOutputCount = inter.outputCount || 1;
        correctedBaseCycleTime = inter.cycleTime || 5;
      }
    }
  }
  return { ...n, baseOutputCount: correctedBaseOutputCount, baseCycleTime: correctedBaseCycleTime };
}

/**
 * 複製子圖（貼上 / 追加專案）：產生新節點與連線 ID、平移座標、深拷貝端口並校準額定產能，
 * 連線端點依新 ID 重新對應。idRandLen 為隨機 ID 片段之 substring 結束位置。
 */
export function cloneSubgraph(
  srcNodes: SandboxNodeData[],
  srcConns: SandboxConnection[],
  offsetX: number,
  offsetY: number,
  idRandLen: number,
  recipes: Recipe[],
  intermediate: IntermediateRecipe[]
): { nodes: SandboxNodeData[]; connections: SandboxConnection[] } {
  const idMap = new Map<string, string>();
  const nodes: SandboxNodeData[] = srcNodes.map(n => {
    const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, idRandLen)}`;
    idMap.set(n.id, newId);
    return {
      ...calibrateNodeBaseRates(n, recipes, intermediate),
      id: newId,
      x: n.x + offsetX,
      y: n.y + offsetY,
      inputs: n.inputs.map(p => ({ ...p })),
      outputs: n.outputs.map(p => ({ ...p }))
    };
  });
  const connections: SandboxConnection[] = srcConns.map(c => ({
    ...c,
    id: `c_${Date.now()}_${Math.random().toString(36).substring(2, idRandLen)}`,
    fromNodeId: idMap.get(c.fromNodeId) || c.fromNodeId,
    toNodeId: idMap.get(c.toNodeId) || c.toNodeId
  }));
  return { nodes, connections };
}

/**
 * 兩份節點清單是否「除座標 (x, y) 外完全相同」（逐欄位參考比較）。
 * 拖曳只會以 {...n, x, y} 產生新物件、其餘欄位沿用原參考，故可快速判定物理結果不需重算。
 */
export function sameNodesIgnoringPosition(a: SandboxNodeData[], b: SandboxNodeData[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const na = a[i] as unknown as Record<string, unknown>;
    const nb = b[i] as unknown as Record<string, unknown>;
    if (na === nb) continue;
    const ka = Object.keys(na);
    if (ka.length !== Object.keys(nb).length) return false;
    for (const k of ka) {
      if (k === 'x' || k === 'y') continue;
      if (!(k in nb) || na[k] !== nb[k]) return false;
    }
  }
  return true;
}

/** 沙盒畫布本機自動存檔 */
export function saveCanvasToLocal(nodes: SandboxNodeData[], connections: SandboxConnection[]) {
  try {
    localStorage.setItem('snacktorio_sandbox_nodes_v1', JSON.stringify(nodes));
    localStorage.setItem('snacktorio_sandbox_conns_v1', JSON.stringify(connections));
  } catch (e) {
    console.error('沙盒畫布自動存檔失敗', e);
  }
}

/**
 * 終端料理產能換算：依目標份/分換算廚師機輸入端需求、流體需求、輸出產率、耗電與妖精，
 * 並嚴格保留既有端口 id（防止管線中斷）。
 */
export function configureDishNodeRates(
  node: SandboxNodeData,
  targetRatePerMin: number,
  recipe: Recipe,
  mach: Machine
): SandboxNodeData {
  const outputCount = recipe.outputCount || 1;
  const cycleTime = recipe.cycleTime || 5;
  const singleRate = outputCount / cycleTime; // 單台廚師機產率 (份/秒)
  const targetPerSec = targetRatePerMin / 60; // 目標產率 (份/秒)
  const machineMultiplier = targetPerSec / singleRate;

  // 固體輸入端口需求換算 (嚴格保留既有 port.id，防止管線中斷跳掉)
  const inputs: SandboxNodeData['inputs'] = [];
  (recipe.inputs || []).forEach((inp, idx) => {
    if (inp.name && !inp.name.startsWith('無') && inp.count > 0) {
      const rateReq = Number(((inp.count / outputCount) * targetPerSec).toFixed(3));
      const existingPort = node.inputs?.find(p => p.name === inp.name && p.type === 'solid') 
        || node.inputs?.[idx];
      const portId = existingPort?.id || `in-${inp.name}`;
      inputs.push({
        id: portId,
        name: inp.name,
        type: 'solid',
        rateRequired: rateReq
      });
    }
  });

  // 連續流體需求換算 (嚴格保留既有流體端口 id)
  if (recipe.fluidType && recipe.fluidType !== '無') {
    const fluidReq = Number(((recipe.fluidRate || 1.0) * machineMultiplier).toFixed(3));
    const existingFluid = node.inputs?.find(p => p.type === 'fluid');
    inputs.push({
      id: existingFluid?.id || `in-fluid-${recipe.fluidType}`,
      name: recipe.fluidType,
      type: 'fluid',
      rateRequired: fluidReq
    });
  }

  // 終端輸出端口產率 (保留既有輸出端口 id)
  const existingOut = node.outputs?.[0];
  const outputs: SandboxNodeData['outputs'] = [{
    id: existingOut?.id || `out-${recipe.name}`,
    name: recipe.name,
    type: 'solid',
    rateProvided: Number(targetPerSec.toFixed(3))
  }];

  return {
    ...node,
    targetRatePerMin,
    basePowerConsumption: Number((mach.power * machineMultiplier).toFixed(2)),
    baseGoblins: Math.max(1, Math.round(mach.goblins * machineMultiplier)),
    inputs,
    outputs
  };
}
