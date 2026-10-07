import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxMetrics,
  PortDefinition
} from './sandboxTypes';

/**
 * 清理物料名稱 (去除分流器百分比後綴如 " (A: 50%)"、"(無限制)" 等附加標記)
 */
export function normalizeItemName(name: string): string {
  if (!name) return '';
  let clean = name.replace(/\s*\([A-Z]:\s*\d+%\)$/, '').trim();
  clean = clean.replace(/\s*\((.*?)\)$/, (match, p1) => {
    if (p1.includes('出') || p1.includes('分流') || p1.includes('無限制') || p1.includes('無限料') || p1.includes('超頻')) return '';
    return match;
  }).trim();
  return clean;
}

/**
 * 嚴格檢驗物料相容性 (嚴格認物品)
 */
export function isItemMatch(
  sourceName: string, 
  targetName: string, 
  targetNode?: SandboxNodeData, 
  targetPortId?: string
): boolean {
  if (!sourceName || !targetName) return false;
  
  const cleanSource = normalizeItemName(sourceName);
  const cleanTarget = normalizeItemName(targetName);

  // 1. 完全相同
  if (cleanSource === cleanTarget) return true;

  // 通用底料相容性：任意物品 / 重構底料 / 底料 互相相容
  const isGenericBase = (s: string) => s === '任意物品' || s === '重構底料' || s === '底料' || s === '底料專供' || s === '底料作物';
  if (isGenericBase(cleanSource) && isGenericBase(cleanTarget)) return true;

  // 2. 特殊設備或通用端口邏輯
  if (targetNode) {
    // 物質操縱機重構底料端口或任意物品端口（如烤箱灰燼）：接受任意固體食材/物品
    if (cleanTarget === '重構底料' || cleanTarget === '任意物品' || targetPortId === 'in-base') {
      return true;
    }

    // 分流器：單一端口為通用接收（多筆輸入是否混流由 incomingItemNames.length 判定）
    if (targetNode.type === 'splitter') {

      return true;
    }

    // 發電熔爐：接受煤炭系列或虛空汙泥
    if (targetNode.type === 'generator') {
      return cleanSource.includes('煤炭') || cleanSource.includes('煤') || cleanSource === '虛空汙泥';
    }

    // 通用抽取泵機流體輸入端口：接受任意環境池或原位轉化液
    if (targetNode.type === 'pump' && targetPortId === 'in-fluid') {
      return true;
    }

    // 泵機超頻端口：嚴格接收虛空汙泥
    if (targetNode.type === 'pump' && targetPortId === 'in-sludge') {
      return cleanSource === '虛空汙泥';
    }

    // 未綁定特定產物之泛用發酵緩衝
    if (targetNode.type === 'buffer_decay' && !targetNode.recipeName) {
      return true;
    }
  }

  // 3. 環境池流體相容性 (水池 <=> 水, 油池 <=> 油, 虛空裂隙 <=> 虛空)
  const normSource = cleanSource.replace('池', '').replace('裂隙', '');
  const normTarget = cleanTarget.replace('池', '').replace('裂隙', '');
  if (normSource === normTarget) return true;

  return false;
}

/**
 * 泵機節點專屬物理更新邏輯 (嚴格物料守恆與降載模型)
 * 1. 虛空汙泥超頻判定與降載：額定需求 0.20/s。若供泥不足，依比例降載 (sludgeSat = sludgeRate / 0.20)。
 * 2. 通用泵機液源判定與降載：環境池/注入機依來源稼動率供液；若為其他來源依實質進液量滿足率。
 * 3. 輸出產率嚴格守恆：actualRate = nominalRate * sludgeSat * fluidSat。
 * @param incoming 本節點之入流連線 (已依目標節點分桶，保留原連線順序)
 */
function updatePumpNode(
  node: SandboxNodeData,
  incoming: SandboxConnection[],
  nodeMap: Map<string, SandboxNodeData>
): void {
  const sludgeConns = incoming.filter(c => c.toPortId === 'in-sludge' || c.toPortId.includes('sludge'));
  const sludgeRate = sludgeConns.reduce((sum, c) => sum + c.actualFlowRate, 0);

  // 只要有接虛空汙泥連線且有流量，即啟用超頻模式（若供泥不足則降載超頻）
  const isOverclocked = sludgeConns.length > 0 && sludgeRate > 0;

  // 虛空汙泥滿足率 (額定需量 0.20/s，容許 0.005 浮點微差)
  const sludgeSat = isOverclocked ? Math.min(1.0, sludgeRate >= 0.195 ? 1.0 : sludgeRate / 0.20) : 1.0;
  const nominalRate = isOverclocked ? 8.0 : 2.0;

  node.powerMode = isOverclocked ? 'overclock' : 'regular';
  node.basePowerConsumption = isOverclocked ? 2.0 : 1.0;
  node.actualPower = Number((node.basePowerConsumption * (isOverclocked ? sludgeSat : 1.0)).toFixed(2));
  node.baseGoblins = isOverclocked ? 2 : 1;
  node.actualGoblins = node.baseGoblins;

  // 檢核輸入端原位液/環境池 (針對通用抽取泵機)
  const fluidInPort = node.inputs.find(p => p.type === 'fluid');
  let fluidSat = 1.0;
  let fluidName = node.outputs[0]?.name || '流體';

  if (fluidInPort) {
    const incomingConns = incoming.filter(c => c.toPortId === fluidInPort.id);
    const incomingFluidRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);

    if (incomingConns.length > 0) {
      const firstConn = incomingConns[0];
      const fromNode = nodeMap.get(firstConn.fromNodeId);
      const fromPort = fromNode?.outputs.find(p => p.id === firstConn.fromPortId);
      fluidName = fromPort?.name || firstConn.itemOrFluidName || '流體';

      if (fromNode && (fromNode.type === 'environment_pool' || fromNode.machineName === '注入機')) {
        fluidSat = fromNode.efficiency;
      } else {
        fluidSat = nominalRate > 0 ? Math.min(1.0, incomingFluidRate / nominalRate) : 0;
      }

      if (fluidSat === 0) {
        node.efficiency = 0;
        node.title = `${fluidName}抽取泵機 (待液源運轉)`;
        node.statusNote = fromNode?.efficiency === 0 ? `❌ 上游「${fromNode.title}」停機斷供` : '❌ 輸入端液體流量為 0';
        node.outputs.forEach(p => {
          p.name = fluidName;
          p.rateProvided = 0;
        });
        node.fluidSaturation = 0;
        node.solidSaturation = Number(sludgeSat.toFixed(3));
        return;
      }
    } else {
      // 未連接液源
      node.efficiency = 0;
      node.title = '通用抽取泵機 (待接液源)';
      node.statusNote = '❌ 未連接原位轉化液或環境池';
      node.outputs.forEach(p => {
        p.rateProvided = 0;
      });
      node.fluidSaturation = 0;
      node.solidSaturation = 0;
      return;
    }
  }

  // 泵機綜合稼動率與實際產率
  const eff = isOverclocked ? sludgeSat * fluidSat : fluidSat;
  const actualOutRate = Number((nominalRate * eff).toFixed(3));

  node.efficiency = Number(eff.toFixed(3));
  node.fluidSaturation = Number(fluidSat.toFixed(3));
  node.solidSaturation = Number(sludgeSat.toFixed(3));

  // 標題與狀態備註
  const modeLabel = isOverclocked 
    ? (sludgeSat >= 1.0 ? '⚡超頻 8 fl/s' : `⚡超頻降載 ${(sludgeSat * 100).toFixed(0)}%`) 
    : '常規 2 fl/s';
  node.title = `${fluidName}抽取泵機 (${modeLabel})`;

  if (isOverclocked && sludgeSat < 1.0) {
    node.statusNote = `⚠️ 虛空汙泥不足 (${(sludgeSat * 100).toFixed(0)}%)：產能降載至 ${actualOutRate} fl/s (⚡超頻降載)`;
  } else if (fluidSat < 1.0) {
    node.statusNote = `⚠️ 進液不足 (${(fluidSat * 100).toFixed(0)}%)：產能降載至 ${actualOutRate} fl/s`;
  } else if (isOverclocked) {
    node.statusNote = `⚡ 超頻滿載運轉中 (${actualOutRate} fl/s)`;
  } else {
    node.statusNote = `正常運轉中 (${actualOutRate} fl/s)`;
  }

  node.outputs.forEach(p => {
    p.name = fluidName;
    p.rateProvided = actualOutRate;
  });
}

const EMPTY_CONNS: SandboxConnection[] = [];

/** 依鍵值將連線分桶 (桶內保留原陣列順序；Map 依首次出現順序迭代) */
function groupConnections(
  connList: SandboxConnection[],
  keyOf: (c: SandboxConnection) => string
): Map<string, SandboxConnection[]> {
  const groups = new Map<string, SandboxConnection[]>();
  connList.forEach(c => {
    const key = keyOf(c);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(c);
    } else {
      groups.set(key, [c]);
    }
  });
  return groups;
}

/**
 * 更新所有連線傳輸流率 (流體均分定律 + 固體分流傳輸)
 * @param portOutgoingMap 依「來源節點_來源端口」分桶之輸出連線
 * @param splitPrecision 均分流率之小數位數 (迭代期 4 位、最終結算 3 位)
 */
function distributeConnectionFlows(
  portOutgoingMap: Map<string, SandboxConnection[]>,
  nodeMap: Map<string, SandboxNodeData>,
  splitPrecision: number
): void {
  portOutgoingMap.forEach((conns) => {
    if (conns.length === 0) return;
    const fromNodeId = conns[0].fromNodeId;
    const fromPortId = conns[0].fromPortId;
    const fromNode = nodeMap.get(fromNodeId);
    if (!fromNode) return;

    const outPort = fromNode.outputs.find(p => p.id === fromPortId);
    const totalRate = outPort?.rateProvided || 0;
    if (outPort?.name) {
      conns.forEach(c => {
        c.itemOrFluidName = outPort.name;
      });
    }

    // 若來源為環境流體池或注入機 (原位轉化池)
    if (fromNode.type === 'environment_pool' || fromNode.machineName === '注入機') {
      conns.forEach(c => {
        if (fromNode.efficiency === 0) {
          c.actualFlowRate = 0;
          return;
        }
        const toNode = nodeMap.get(c.toNodeId);
        const inPort = toNode?.inputs.find(p => p.id === c.toPortId);
        let demand = inPort?.rateRequired || 1.0;
        if (toNode?.type === 'pump') {
          demand = toNode.powerMode === 'overclock' ? 8.0 : 2.0;
        }
        // 環境池為無限源 (efficiency = 1.0)；注入機若欠壓則依 efficiency 降載供液
        const availableRate = demand * fromNode.efficiency;
        c.actualFlowRate = Number(availableRate.toFixed(2));
      });
      return;
    }

    // 若來源機台停機 (efficiency === 0)，下游連線流量絕對為 0
    if (fromNode.efficiency === 0) {
      conns.forEach(c => {
        c.actualFlowRate = 0;
      });
      return;
    }

    // 均分定律：若輸出端口連至多台下游設備，流率被連線均等分流
    const splitRate = totalRate / conns.length;
    conns.forEach(c => {
      c.actualFlowRate = Number(splitRate.toFixed(splitPrecision));
    });
  });
}

/**
 * 檢核同一類型 (流體 / 固體) 輸入端口之滿足率，並回寫各端口 rateReceived / isDeficit
 * @param looseMatch 迭代期允許「物料名稱相同且端口 ID 以 -名稱 結尾」(涵蓋 in-名稱 / in-fluid-名稱) 之寬鬆配對；最終校準僅認端口 ID
 */
function evaluateInputPorts(
  node: SandboxNodeData,
  incoming: SandboxConnection[],
  ports: PortDefinition[],
  isFluid: boolean,
  looseMatch: boolean
) {
  let minSat = 1.0;
  let missingName = '';
  let missingDetail = '';
  let hasMismatch = false;
  let mismatchDetail = '';
  const unit = isFluid ? ' fl/s' : '/s';

  ports.forEach(p => {
    const validConns: SandboxConnection[] = [];
    const invalidConns: SandboxConnection[] = [];
    incoming.forEach(c => {
      const linked = c.toPortId === p.id ||
        (looseMatch && c.itemOrFluidName === p.name && c.toPortId.endsWith(`-${p.name}`));
      if (!linked) return;
      (isItemMatch(c.itemOrFluidName, p.name, node, p.id) ? validConns : invalidConns).push(c);
    });

    if (invalidConns.length > 0) {
      hasMismatch = true;
      const wrong = Array.from(new Set(invalidConns.map(c => normalizeItemName(c.itemOrFluidName)))).join('、');
      mismatchDetail = `❌ 錯誤連入${isFluid ? '流體' : '原料'}：${wrong}（需求：${p.name}）`;
    }

    const receivedRate = validConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
    const defaultReq = isFluid ? 1.0 : (node.baseCycleTime > 0 ? 1 / node.baseCycleTime : 0.2);
    const reqRate = p.rateRequired !== undefined ? p.rateRequired : defaultReq;
    p.rateReceived = Number(receivedRate.toFixed(2));
    p.isDeficit = (reqRate > 0 && receivedRate < reqRate - 0.005) || invalidConns.length > 0;
    const sat = invalidConns.length > 0 ? 0 : (reqRate > 0 ? (receivedRate >= reqRate - 0.005 ? 1.0 : Math.min(1.0, receivedRate / reqRate)) : 1.0);
    if (sat < minSat) {
      minSat = sat;
      missingName = p.name;
      missingDetail = `供給 ${receivedRate.toFixed(2)}${unit} < 需求 ${reqRate.toFixed(2)}${unit}`;
    }
  });

  return { minSat, missingName, missingDetail, hasMismatch, mismatchDetail };
}

/**
 * 常規機台：輸入滿足率、欠壓週期拉長、狀態標註與輸出端口產率
 * @param looseMatch 見 evaluateInputPorts (迭代期 true、最終校準 false)
 * @param resetAbsentSaturation 無該類型輸入端口時將對應滿足率重設為 1.0 (迭代期 true、最終校準 false)
 */
function evaluateMachineNode(
  node: SandboxNodeData,
  incoming: SandboxConnection[],
  looseMatch: boolean,
  resetAbsentSaturation: boolean
): void {
  // 3. 檢核流體輸入端口滿足率
  const fluidInputs = node.inputs.filter(p => p.type === 'fluid');
  const fluid = evaluateInputPorts(node, incoming, fluidInputs, true, looseMatch);
  if (fluidInputs.length > 0) {
    node.fluidSaturation = Number(fluid.minSat.toFixed(3));
  } else if (resetAbsentSaturation) {
    node.fluidSaturation = 1.0;
  }

  // 4. 檢核固體輸入端口滿足率
  const solidInputs = node.inputs.filter(p => p.type === 'solid');
  const solid = evaluateInputPorts(node, incoming, solidInputs, false, looseMatch);
  if (solidInputs.length > 0) {
    node.solidSaturation = Number(solid.minSat.toFixed(3));
  } else if (resetAbsentSaturation) {
    node.solidSaturation = 1.0;
  }

  const minFluidSat = fluid.minSat;
  const minSolidSat = solid.minSat;

  // 5. 核心物理：流體欠壓週期拉長 (Cycle Dilation) 與狀態標註
  if (fluid.hasMismatch) {
    node.efficiency = 0;
    node.actualCycleTime = node.baseCycleTime;
    node.statusNote = fluid.mismatchDetail;
  } else if (solid.hasMismatch) {
    node.efficiency = 0;
    node.actualCycleTime = node.baseCycleTime;
    node.statusNote = solid.mismatchDetail;
  } else if (fluidInputs.length > 0 && minFluidSat === 0) {
    node.efficiency = 0;
    node.actualCycleTime = node.baseCycleTime;
    node.statusNote = `❌ 缺少流體：${fluid.missingName || '流體斷供'}`;
  } else if (solidInputs.length > 0 && minSolidSat === 0) {
    node.efficiency = 0;
    node.actualCycleTime = node.baseCycleTime;
    node.statusNote = `❌ 缺少原料：${solid.missingName || '固體斷供'}`;
  } else if (minFluidSat < 1.0) {
    // 週期等比例反比拉長
    const dilatedCycle = node.baseCycleTime / minFluidSat;
    node.actualCycleTime = Number(dilatedCycle.toFixed(2));
    node.efficiency = Number((minFluidSat * minSolidSat).toFixed(3));
    const solidNote = minSolidSat < 1.0 ? `，且 ${solid.missingName} 不足 (${(minSolidSat * 100).toFixed(0)}%)` : '';
    node.statusNote = `⚠️ 產能跟不上！流體欠壓 ${(minFluidSat * 100).toFixed(0)}% (${fluid.missingDetail})：週期拉長至 ${node.actualCycleTime}s${solidNote}`;
  } else if (minSolidSat < 1.0) {
    node.actualCycleTime = node.baseCycleTime;
    node.efficiency = Number(minSolidSat.toFixed(3));
    node.statusNote = `⚠️ 產能跟不上！${solid.missingName} 不足 (${(minSolidSat * 100).toFixed(0)}%)：${solid.missingDetail}，產能降載至 ${(node.efficiency * 100).toFixed(0)}%`;
  } else {
    node.actualCycleTime = node.baseCycleTime;
    node.efficiency = 1.0;
    node.statusNote = '正常運轉中';
  }

  // 6. 更新輸出端口產率
  node.outputs.forEach(p => {
    // 若機台停機 (efficiency === 0)，輸出端口產率絕對為 0
    if (node.efficiency === 0) {
      p.rateProvided = 0;
      return;
    }
    if (node.machineName === '注入機') {
      p.rateProvided = 999;
      return;
    }
    const actualOutRate = node.actualCycleTime > 0
      ? (node.baseOutputCount / node.actualCycleTime) * minSolidSat
      : 0;
    p.rateProvided = Number(actualOutRate.toFixed(3));
  });
}

/**
 * 自由沙盒即時物理引擎 (Sandbox Physics Engine)
 * 核心機制：
 * 1. 連續流體無上限與強制絕對均分定律 (Equal Fluid Sharing)
 * 2. 流體欠壓拉長加工週期物理模型 (Undersaturated Fluid Cycle Dilation)
 * 3. 固體物料瓶頸傳導 (Bottleneck Propagation)
 * 4. 即時電網與人力負載彙整 (Power Grid & Goblins)
 */
export function simulateSandboxPhysics(
  nodes: SandboxNodeData[],
  connections: SandboxConnection[]
): {
  updatedNodes: SandboxNodeData[];
  updatedConnections: SandboxConnection[];
  metrics: SandboxMetrics;
} {
  const nodeMap = new Map<string, SandboxNodeData>(
    nodes.map(n => [n.id, { 
      ...n, 
      inputs: n.inputs.map(p => ({ ...p })), 
      outputs: n.outputs.map(p => ({ ...p })) 
    }])
  );

  const connList: SandboxConnection[] = connections.map(c => ({ ...c, actualFlowRate: 0 }));

  // 連線拓撲於模擬期間固定不變 (僅流率與物料名稱更新)，故輸出/入流分桶只需建立一次；桶內保留原連線順序
  const portOutgoingMap = groupConnections(connList, c => `${c.fromNodeId}_${c.fromPortId}`);
  const incomingByNode = groupConnections(connList, c => c.toNodeId);
  const incomingOf = (nodeId: string) => incomingByNode.get(nodeId) || EMPTY_CONNS;

  // ==============================================================
  // 動態自適應收斂 (Adaptive Convergence)：
  // 不死板依賴固定次數，而是動態偵測全廠連線流率與機台稼動率是否完全收斂 (前後輪變量 < 0.0005)。
  // 簡單拓撲提早中斷 (極速運算)，極深鏈路 (10~20+ 階) 自動延伸推進至完全穩定！
  // ==============================================================
  const MAX_ITERATIONS = Math.max(25, Math.min(60, nodeMap.size * 2 + 5));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const prevConnRates = connList.map(c => c.actualFlowRate);
    const prevNodeEffs = Array.from(nodeMap.values()).map(n => n.efficiency);

    // ----------------------------------------------------
    // 階段 1：更新所有連線傳輸流率 (流體均分定律 + 固體分流傳輸)
    // ----------------------------------------------------
    distributeConnectionFlows(portOutgoingMap, nodeMap, 4);

    // ----------------------------------------------------
    // 階段 2：機台滿足率、欠壓週期拉長與稼動率演算
    // ----------------------------------------------------
    nodeMap.forEach(node => {
      // 1. 若開啟「無中生有 (Mock Infinite Supply)」
      if (node.isMockInfiniteSupply) {
        node.fluidSaturation = 1.0;
        node.solidSaturation = 1.0;
        node.efficiency = 1.0;
        node.actualCycleTime = node.baseCycleTime;
        node.statusNote = '✨ 無中生有：原料無限供應';

        node.outputs.forEach(p => {
          if (node.machineName === '注入機') {
            p.rateProvided = 999;
            return;
          }
          const rate = node.baseCycleTime > 0 ? node.baseOutputCount / node.baseCycleTime : 0.2;
          p.rateProvided = Number(rate.toFixed(3));
        });
        return;
      }

      // 泵機節點專屬物理：支援水/油/虛空與通用抽取泵機，輸入虛空汙泥自動超頻至 8.0 fl/s (嚴格守恆降載)
      if (node.type === 'pump') {
        updatePumpNode(node, incomingOf(node.id), nodeMap);
        return;
      }

      // 物品分流器專屬物理 (Splitter)：支援 1 進 2 出 或 1 進 3 出，支援均分模式與自訂流量模式
      if (node.type === 'splitter') {
        const inPort = node.inputs[0];
        const incomingConns = inPort ? incomingOf(node.id).filter(c => c.toPortId === inPort.id) : [];
        const inRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
        const outCount = Math.max(1, node.outputs.length);

        if (incomingConns.length > 0 && inRate > 0) {
          // 檢查是否有多種不同物料混入同一個分流器 (Contamination Check)
          const incomingItemNames = Array.from(new Set(
            incomingConns
              .map(c => normalizeItemName(c.itemOrFluidName))
              .filter(n => n.length > 0 && n !== '物品' && n !== '分流物品')
          ));

          if (incomingItemNames.length > 1) {
            // 混流污染！停機並發出強烈警告
            node.efficiency = 0;
            node.solidSaturation = 0;
            node.fluidSaturation = 0;
            node.title = `分流器 (混流污染) · ${outCount}出`;
            node.statusNote = `❌ 物料混流污染！同時混入：${incomingItemNames.join('、')}（嚴禁混流，設備停機）`;
            if (inPort) {
              inPort.name = '混流污染';
              inPort.rateReceived = Number(inRate.toFixed(2));
              inPort.isDeficit = true;
            }
            node.outputs.forEach(p => {
              p.name = '混流污染';
              p.rateProvided = 0;
            });
            return;
          }

          const rawItemName = incomingItemNames[0] || incomingConns[0].itemOrFluidName || '物品';
          const itemName = normalizeItemName(rawItemName);

          node.efficiency = 1.0;
          node.solidSaturation = 1.0;
          node.fluidSaturation = 1.0;
          node.title = `分流器 (${itemName}) · ${outCount}出`;

          if (inPort) {
            inPort.name = itemName;
            inPort.rateReceived = Number(inRate.toFixed(2));
            inPort.isDeficit = false;
            delete inPort.rateRequired;
          }

          if (node.splitterMode === 'custom') {
            // 自訂輸出比例模式 (Ratio-based)：依各出口設定之權重比例分流 (如 2:1 或 1:2:1)
            const rawRatios = (node.splitterRatios && node.splitterRatios.length === outCount)
              ? node.splitterRatios
              : (node.splitterCustomRates && node.splitterCustomRates.length === outCount
                  ? node.splitterCustomRates
                  : node.outputs.map(() => 1));

            const sumRatios = rawRatios.reduce((s, r) => s + (r > 0 ? r : 0), 0);
            
            node.outputs.forEach((p, idx) => {
              const weight = rawRatios[idx] > 0 ? rawRatios[idx] : 0;
              const frac = sumRatios > 0 ? weight / sumRatios : (1 / outCount);
              const percent = (frac * 100).toFixed(0);
              const label = String.fromCharCode(65 + idx);
              p.name = `${itemName} (${label}: ${percent}%)`;
              p.rateProvided = Number((inRate * frac).toFixed(4));
            });

            const ratioStr = rawRatios.map(r => Number(r.toFixed(2))).join(' : ');
            const percentStr = rawRatios.map(r => sumRatios > 0 ? `${((r / sumRatios) * 100).toFixed(1)}%` : `${(100 / outCount).toFixed(1)}%`).join(' : ');
            node.statusNote = `📐 比例分流 (${ratioStr} ➔ ${percentStr})：進 ${inRate.toFixed(2)}/s，各路 [${node.outputs.map(p => p.rateProvided).join(', ')}]/s`;
          } else {
            // 均分模式：1:1(:1) 均等分流
            const frac = 1 / outCount;
            const percent = (frac * 100).toFixed(0);
            const outPerPort = Number((inRate * frac).toFixed(4));
            node.outputs.forEach((p, idx) => {
              const label = String.fromCharCode(65 + idx);
              p.name = `${itemName} (${label}: ${percent}%)`;
              p.rateProvided = outPerPort;
            });
            node.statusNote = `⚡ 均等分流中 (${outCount}出)：進 ${inRate.toFixed(2)}/s，各路 ${outPerPort}/s`;
          }
        } else {
          node.efficiency = 0;
          node.solidSaturation = 0;
          node.fluidSaturation = 0;
          node.title = `物品分流器 (${outCount}出)`;
          node.statusNote = incomingConns.length === 0 ? '⚠️ 未連接輸入物料' : '❌ 輸入流量為 0';
          if (inPort) {
            inPort.name = '待分流物料';
            inPort.rateReceived = 0;
            inPort.isDeficit = false;
            delete inPort.rateRequired;
          }
          node.outputs.forEach(p => {
            p.name = '分流物品';
            p.rateProvided = 0;
          });
        }
        return;
      }

      // 發酵變質 / 輸送緩衝方塊專屬物理 (Buffer / Fermentation)
      if (node.type === 'buffer_decay') {
        const inPort = node.inputs[0];
        const incomingConns = inPort ? incomingOf(node.id).filter(c => c.toPortId === inPort.id) : [];
        const inRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);

        if (incomingConns.length > 0 && inRate > 0) {
          const firstConn = incomingConns[0];
          const rawName = normalizeItemName(firstConn.itemOrFluidName || '原料');
          const expectedName = inPort?.name || '原料';

          // 若節點明確指定了需求原料且不相符
          if (expectedName !== '原料' && expectedName !== '發酵原料' && !isItemMatch(rawName, expectedName, node, inPort?.id)) {
            node.efficiency = 0;
            node.solidSaturation = 0;
            node.fluidSaturation = 0;
            node.statusNote = `❌ 原料不符合：需求「${expectedName}」，但連入「${rawName}」`;
            if (inPort) {
              inPort.isDeficit = true;
              inPort.rateReceived = Number(inRate.toFixed(2));
            }
            node.outputs.forEach(p => { p.rateProvided = 0; });
            return;
          }

          // 若節點未指定食譜/成品，預設或沿用 output[0] 名稱
          const targetOutName = node.outputs[0]?.name || node.recipeName || rawName;

          node.efficiency = 1.0;
          node.solidSaturation = 1.0;
          node.fluidSaturation = 1.0;
          node.statusNote = `⏳ 發酵完成：${rawName} ➔ ${targetOutName} (${inRate.toFixed(2)}/s)`;

          // 產出率 100% 傳遞
          node.outputs.forEach(p => {
            p.rateProvided = Number(inRate.toFixed(3));
          });
        } else {
          node.efficiency = 0;
          node.solidSaturation = 0;
          node.fluidSaturation = 0;
          node.statusNote = incomingConns.length === 0 ? '⚠️ 待連接發酵前原料' : '❌ 輸入原料斷供 (0/s)';
          node.outputs.forEach(p => {
            p.rateProvided = 0;
          });
        }
        return;
      }

      // 2. 若設備為零輸入節點 (如採掘機、收割機、環境池)
      if (node.inputs.length === 0) {
        node.fluidSaturation = 1.0;
        node.solidSaturation = 1.0;
        node.efficiency = 1.0;
        node.actualCycleTime = node.baseCycleTime;
        node.statusNote = '正常運轉中';

        node.outputs.forEach(p => {
          const rate = node.baseCycleTime > 0 ? node.baseOutputCount / node.baseCycleTime : 0.2;
          p.rateProvided = Number(rate.toFixed(3));
        });
        return;
      }

      // 3~6. 輸入滿足率、欠壓週期拉長、狀態標註與輸出產率 (迭代期允許名稱/端口後綴寬鬆配對)
      evaluateMachineNode(node, incomingOf(node.id), true, true);
    });

    // 檢查全廠狀態是否已完全收斂 (前後輪變量 < 0.0005)
    if (iter >= 1) {
      let isFullyConverged = true;
      for (let i = 0; i < connList.length; i++) {
        if (Math.abs(connList[i].actualFlowRate - prevConnRates[i]) > 0.0005) {
          isFullyConverged = false;
          break;
        }
      }
      if (isFullyConverged) {
        const nodesList = Array.from(nodeMap.values());
        for (let i = 0; i < nodesList.length; i++) {
          if (Math.abs(nodesList[i].efficiency - prevNodeEffs[i]) > 0.0005) {
            isFullyConverged = false;
            break;
          }
        }
      }

      if (isFullyConverged) {
        break; // 全廠物理狀態已達到完美穩態，提早結束迴圈
      }
    }
  }

  // ==============================================================
  // 最終連線流量結算：確保所有連線 100% 與機台最終收斂狀態一致
  // ==============================================================
  distributeConnectionFlows(portOutgoingMap, nodeMap, 3);

  // 連線流量最終確定後，對所有泵機進行最終超頻狀態結算 (嚴格守恆降載)
  nodeMap.forEach(node => {
    if (node.type === 'pump') {
      updatePumpNode(node, incomingOf(node.id), nodeMap);
    }
  });

  // 最終全機台狀態校準刷新：確保機台 statusNote 與實際連線流量 100% 同步無時序延遲
  // (僅認端口 ID 嚴格配對；無該類型端口時保留既有滿足率)
  nodeMap.forEach(node => {
    if (node.isMockInfiniteSupply || node.type === 'pump' || node.type === 'environment_pool' || node.type === 'splitter' || node.type === 'buffer_decay') return;
    if (node.inputs.length === 0) return;
    evaluateMachineNode(node, incomingOf(node.id), false, false);
  });

  // ==========================================
  // 階段 3：全廠電網、人力與指標彙整
  // ==========================================
  let totalPowerGen = 0;
  let totalPowerLoad = 0;
  let totalGoblins = 0;
  const fluidsSummary = {
    water: { produced: 0, consumed: 0 },
    oil: { produced: 0, consumed: 0 },
    void: { produced: 0, consumed: 0 },
    custom: {} as Record<string, { produced: number; consumed: number }>
  };
  const terminalDishes: SandboxMetrics['terminalDishes'] = [];

  const registerFluidTally = (name: string, rate: number, type: 'produced' | 'consumed') => {
    if (!name || name === '流體' || rate <= 0) return;
    if (name === '水' || name === '純淨水') {
      fluidsSummary.water[type] += rate;
    } else if (name === '油') {
      fluidsSummary.oil[type] += rate;
    } else if (name === '虛空' || name === '虛空流體') {
      fluidsSummary.void[type] += rate;
    } else {
      fluidsSummary.custom[name] = fluidsSummary.custom[name] || { produced: 0, consumed: 0 };
      fluidsSummary.custom[name][type] += rate;
    }
  };

  nodeMap.forEach(n => {
    // 發電機處理 (燃燒煤炭發電，缺燃料時不發電)
    if (n.type === 'generator') {
      const nominalPower = n.powerMode === 'overclock' ? 16.0 : 4.0;
      const actualGen = nominalPower * n.efficiency;
      totalPowerGen += actualGen;
      n.actualPower = actualGen;
      totalGoblins += 1;
      return;
    }

    // 泵機處理
    if (n.type === 'pump') {
      totalPowerLoad += n.actualPower || n.basePowerConsumption;
      totalGoblins += n.actualGoblins || n.baseGoblins;
      n.outputs.forEach(p => {
        registerFluidTally(p.name, p.rateProvided || 0, 'produced');
      });
      return;
    }

    // 常規機台與廚師機
    if (n.type === 'machine') {
      totalPowerLoad += n.basePowerConsumption;
      totalGoblins += n.baseGoblins;

      // 累計機台流體產出 (如攪拌機生產蟑螂奶、調和機生產番茄醬等連續流體)
      n.outputs.forEach(p => {
        if (p.type === 'fluid') {
          registerFluidTally(p.name, p.rateProvided || 0, 'produced');
        }
      });

      // 累計機台流體消耗
      n.inputs.forEach(p => {
        if (p.type === 'fluid') {
          const req = p.rateRequired || 1.0;
          registerFluidTally(p.name, req, 'consumed');
        }
      });

      // 終端廚師機出餐追蹤
      if (n.machineName === '自動廚師機' && n.recipeName) {
        const dishRatePerSec = n.outputs[0]?.rateProvided || 0;
        terminalDishes.push({
          dishName: n.recipeName,
          ratePerMin: Number((dishRatePerSec * 60).toFixed(1)),
          efficiency: Number((n.efficiency * 100).toFixed(1))
        });
      }
    }
  });

  [fluidsSummary.water, fluidsSummary.oil, fluidsSummary.void, ...Object.values(fluidsSummary.custom)].forEach(tally => {
    tally.produced = Number(tally.produced.toFixed(2));
    tally.consumed = Number(tally.consumed.toFixed(2));
  });

  const powerBalance = Number((totalPowerGen - totalPowerLoad).toFixed(1));

  return {
    updatedNodes: Array.from(nodeMap.values()),
    updatedConnections: connList,
    metrics: {
      totalPowerGen: Number(totalPowerGen.toFixed(1)),
      totalPowerLoad: Number(totalPowerLoad.toFixed(1)),
      powerBalance,
      totalGoblins,
      machineCount: nodes.filter(n => n.type === 'machine' || n.type === 'generator' || n.type === 'pump').length,
      fluidsSummary,
      terminalDishes
    }
  };
}
