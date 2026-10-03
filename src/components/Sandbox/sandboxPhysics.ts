import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxMetrics 
} from './sandboxTypes';

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
    nodes.map(n => [n.id, { ...n, inputs: [...n.inputs], outputs: [...n.outputs] }])
  );

  const connList: SandboxConnection[] = connections.map(c => ({ ...c, actualFlowRate: 0 }));

  // ==========================================
  // 階段 1：流體供給源與管網強制均分演算
  // ==========================================
  const fluidSuppliers = new Map<string, { totalProvided: number; conns: SandboxConnection[] }>();

  connList.forEach(c => {
    if (c.type === 'fluid') {
      const fromNode = nodeMap.get(c.fromNodeId);
      if (!fromNode) return;
      
      const outPort = fromNode.outputs.find(p => p.id === c.fromPortId);
      const rate = outPort?.rateProvided || 0;

      const key = `${c.fromNodeId}_${c.fromPortId}`;
      if (!fluidSuppliers.has(key)) {
        fluidSuppliers.set(key, { totalProvided: rate, conns: [] });
      }
      fluidSuppliers.get(key)!.conns.push(c);
    }
  });

  // 強制均分定律：供給端所有流量被下游連線設備絕對均分
  fluidSuppliers.forEach(({ totalProvided, conns }) => {
    if (conns.length === 0) return;
    const splitRate = totalProvided / conns.length;
    conns.forEach(c => {
      c.actualFlowRate = Number(splitRate.toFixed(3));
    });
  });

  // ==========================================
  // 階段 2：機台滿足率與欠壓週期拉長演算
  // ==========================================
  nodeMap.forEach(node => {
    // 預設重設狀態
    node.fluidSaturation = 1.0;
    node.solidSaturation = 1.0;
    node.efficiency = 1.0;
    node.actualCycleTime = node.baseCycleTime;
    node.statusNote = '正常運轉中';

    // 若開啟「無中生有 (Mock Infinite Supply)」，直接給予 100% 滿載
    if (node.isMockInfiniteSupply) {
      node.fluidSaturation = 1.0;
      node.solidSaturation = 1.0;
      node.efficiency = 1.0;
      node.statusNote = '無中生有：原料無限供應';
      return;
    }

    // 若設備不需要任何輸入 (如環境池、或獨立發電機)
    if (node.inputs.length === 0) {
      node.fluidSaturation = 1.0;
      node.solidSaturation = 1.0;
      node.efficiency = 1.0;
      return;
    }

    // 檢核流體輸入端口滿足率
    const fluidInputs = node.inputs.filter(p => p.type === 'fluid');
    if (fluidInputs.length > 0) {
      let minFluidSat = 1.0;
      fluidInputs.forEach(p => {
        const incomingConns = connList.filter(c => c.toNodeId === node.id && c.toPortId === p.id);
        const receivedRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
        const reqRate = p.rateRequired || 1.0;

        const sat = reqRate > 0 ? Math.min(1.0, receivedRate / reqRate) : 1.0;
        if (sat < minFluidSat) {
          minFluidSat = sat;
        }
      });
      node.fluidSaturation = Number(minFluidSat.toFixed(3));
    }

    // 檢核固體輸入端口滿足率
    const solidInputs = node.inputs.filter(p => p.type === 'solid');
    if (solidInputs.length > 0) {
      let minSolidSat = 1.0;
      solidInputs.forEach(p => {
        const incomingConns = connList.filter(c => c.toNodeId === node.id && c.toPortId === p.id);
        if (incomingConns.length === 0) {
          minSolidSat = 0;
        } else {
          // 固體供給率檢測 (若上游供給不足則欠料)
          const totalIncoming = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
          const req = p.rateRequired || (node.baseCycleTime > 0 ? 1 / node.baseCycleTime : 0.2);
          const sat = req > 0 ? Math.min(1.0, totalIncoming / req) : 1.0;
          if (sat < minSolidSat) minSolidSat = sat;
        }
      });
      node.solidSaturation = Number(minSolidSat.toFixed(3));
    }

    // 核心物理：流體欠壓週期拉長 (Cycle Dilation)
    if (node.fluidSaturation > 0 && node.fluidSaturation < 1.0) {
      // 週期依流體滿足率反比拉長：週期 = 基準週期 / 滿足率 (如 50% 供給率 -> 週期拉長為 2 倍)
      const dilatedCycle = node.baseCycleTime / node.fluidSaturation;
      node.actualCycleTime = Number(dilatedCycle.toFixed(2));
      node.efficiency = Number((node.fluidSaturation * node.solidSaturation).toFixed(3));
      node.statusNote = `⚠️ 流體欠壓 ${(node.fluidSaturation * 100).toFixed(0)}%：週期自 ${node.baseCycleTime}s 拉長至 ${node.actualCycleTime}s`;
    } else if (node.fluidSaturation === 0) {
      node.efficiency = 0;
      node.statusNote = '❌ 嚴重欠液停機 (無流體輸入)';
    } else if (node.solidSaturation === 0) {
      node.efficiency = 0;
      node.statusNote = '❌ 缺固體原料停機';
    } else if (node.solidSaturation < 1.0) {
      node.efficiency = Number(node.solidSaturation.toFixed(3));
      node.statusNote = `⚠️ 固體物料不足 (${(node.solidSaturation * 100).toFixed(0)}%)`;
    }

    // 傳導更新該機台各輸出端口的實際產出速率 (rateProvided)
    node.outputs.forEach(p => {
      const baseOutRate = node.baseCycleTime > 0 ? node.baseOutputCount / node.baseCycleTime : 0;
      // 實際產出速率 = (單次產量 / 實際拉長後週期) * 固體滿足率
      const actualOutRate = node.actualCycleTime > 0 
        ? (node.baseOutputCount / node.actualCycleTime) * node.solidSaturation 
        : baseOutRate * node.efficiency;
      p.rateProvided = Number(actualOutRate.toFixed(3));
    });
  });

  // 更新固體連線的流率
  connList.forEach(c => {
    if (c.type === 'solid') {
      const fromNode = nodeMap.get(c.fromNodeId);
      if (fromNode) {
        const outPort = fromNode.outputs.find(p => p.id === c.fromPortId);
        c.actualFlowRate = outPort?.rateProvided || 0;
      }
    }
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

  nodeMap.forEach(n => {
    // 發電機處理
    if (n.type === 'generator') {
      const genPower = n.powerMode === 'overclock' ? 16.0 : 4.0;
      totalPowerGen += genPower;
      totalPowerLoad += 0; // 發電機本身淨發電
      totalGoblins += 1;
      return;
    }

    // 泵機處理
    if (n.type === 'pump') {
      totalPowerLoad += n.basePowerConsumption;
      totalGoblins += n.baseGoblins;
      n.outputs.forEach(p => {
        const name = p.name;
        const rate = p.rateProvided || 0;
        if (name.includes('水')) fluidsSummary.water.produced += rate;
        else if (name.includes('紅油')) {
          fluidsSummary.custom['炙烈紅油'] = fluidsSummary.custom['炙烈紅油'] || { produced: 0, consumed: 0 };
          fluidsSummary.custom['炙烈紅油'].produced += rate;
        } else if (name.includes('油')) fluidsSummary.oil.produced += rate;
        else if (name.includes('虛空')) fluidsSummary.void.produced += rate;
        else {
          fluidsSummary.custom[name] = fluidsSummary.custom[name] || { produced: 0, consumed: 0 };
          fluidsSummary.custom[name].produced += rate;
        }
      });
      return;
    }

    // 常規機台與廚師機
    if (n.type === 'machine') {
      const power = n.basePowerConsumption;
      totalPowerLoad += power;
      totalGoblins += n.baseGoblins;

      // 累計流體消耗
      n.inputs.forEach(p => {
        if (p.type === 'fluid') {
          const req = p.rateRequired || 1.0;
          if (p.name.includes('水')) fluidsSummary.water.consumed += req;
          else if (p.name.includes('紅油')) {
            fluidsSummary.custom['炙烈紅油'] = fluidsSummary.custom['炙烈紅油'] || { produced: 0, consumed: 0 };
            fluidsSummary.custom['炙烈紅油'].consumed += req;
          } else if (p.name.includes('油')) fluidsSummary.oil.consumed += req;
          else if (p.name.includes('虛空')) fluidsSummary.void.consumed += req;
          else {
            fluidsSummary.custom[p.name] = fluidsSummary.custom[p.name] || { produced: 0, consumed: 0 };
            fluidsSummary.custom[p.name].consumed += req;
          }
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
