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
    nodes.map(n => [n.id, { 
      ...n, 
      inputs: n.inputs.map(p => ({ ...p })), 
      outputs: n.outputs.map(p => ({ ...p })) 
    }])
  );

  const connList: SandboxConnection[] = connections.map(c => ({ ...c, actualFlowRate: 0 }));

  // ==============================================================
  // 多輪迭代傳導 (4 次)，確保深層多階 DAG 依序傳導流率並完全收斂
  // ==============================================================
  for (let iter = 0; iter < 4; iter++) {
    // ----------------------------------------------------
    // 階段 1：更新所有連線傳輸流率 (流體均分定律 + 固體分流傳輸)
    // ----------------------------------------------------
    const portOutgoingMap = new Map<string, SandboxConnection[]>();
    connList.forEach(c => {
      const key = `${c.fromNodeId}_${c.fromPortId}`;
      if (!portOutgoingMap.has(key)) {
        portOutgoingMap.set(key, []);
      }
      portOutgoingMap.get(key)!.push(c);
    });

    portOutgoingMap.forEach((conns, key) => {
      if (conns.length === 0) return;
      const [fromNodeId, fromPortId] = key.split('_');
      const fromNode = nodeMap.get(fromNodeId);
      if (!fromNode) return;

      const outPort = fromNode.outputs.find(p => p.id === fromPortId);
      const totalRate = outPort?.rateProvided || 0;
      
      // 均分定律：若輸出端口連至多台下游設備，流率被連線均等分流
      const splitRate = conns.length > 0 ? totalRate / conns.length : 0;
      conns.forEach(c => {
        c.actualFlowRate = Number(splitRate.toFixed(3));
      });
    });

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
          const rate = node.baseCycleTime > 0 ? node.baseOutputCount / node.baseCycleTime : 0.2;
          p.rateProvided = Number(rate.toFixed(3));
        });
        return;
      }

      // 泵機節點專屬物理：支援水/油/虛空與通用抽取泵機，輸入虛空汙泥自動超頻至 8.0 fl/s
      if (node.type === 'pump') {
        const sludgeConns = connList.filter(c => c.toNodeId === node.id && (c.toPortId === 'in-sludge' || c.toPortId.includes('sludge')));
        const sludgeRate = sludgeConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
        const isOverclocked = sludgeRate >= 0.1;

        node.powerMode = isOverclocked ? 'overclock' : 'regular';
        node.basePowerConsumption = isOverclocked ? 2.0 : 1.0;
        node.actualPower = node.basePowerConsumption;
        node.baseGoblins = isOverclocked ? 2 : 1;
        node.actualGoblins = node.baseGoblins;

        const targetRate = isOverclocked ? 8.0 : 2.0;

        // 通用泵機：檢核輸入端原位液/環境池
        const fluidInPort = node.inputs.find(p => p.type === 'fluid');
        if (fluidInPort) {
          const incomingConns = connList.filter(c => c.toNodeId === node.id && c.toPortId === fluidInPort.id);
          const incomingFluidRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
          if (incomingConns.length > 0 && incomingFluidRate > 0) {
            const firstConn = incomingConns[0];
            const fromNode = nodeMap.get(firstConn.fromNodeId);
            const fromPort = fromNode?.outputs.find(p => p.id === firstConn.fromPortId);
            const fluidName = fromPort?.name || firstConn.itemOrFluidName || '流體';

            node.title = `${fluidName}抽取泵機 (${isOverclocked ? '⚡超頻 8 fl/s' : '常規 2 fl/s'})`;
            node.efficiency = 1.0;
            node.statusNote = isOverclocked ? `⚡ 超頻運轉中：輸出 ${fluidName} 8.0 fl/s` : `正常運轉中：輸出 ${fluidName} 2.0 fl/s`;
            node.outputs.forEach(p => {
              p.name = fluidName;
              p.rateProvided = targetRate;
            });
          } else {
            node.efficiency = 0;
            node.title = '通用抽取泵機 (待接液源)';
            node.statusNote = '❌ 未連接原位轉化液或環境池';
            node.outputs.forEach(p => {
              p.rateProvided = 0;
            });
          }
        } else {
          // 專屬流體泵機 (水, 油, 虛空)
          node.efficiency = 1.0;
          const fluidName = node.outputs[0]?.name || '流體';
          node.title = `${fluidName}抽取泵機 (${isOverclocked ? '⚡超頻 8 fl/s' : '常規 2 fl/s'})`;
          node.statusNote = isOverclocked ? '⚡ 超頻運轉中 (8.0 fl/s)' : '正常運轉中 (常規 2.0 fl/s)';
          node.outputs.forEach(p => {
            p.rateProvided = targetRate;
          });
        }

        node.fluidSaturation = 1.0;
        node.solidSaturation = 1.0;
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

      // 3. 檢核流體輸入端口滿足率
      const fluidInputs = node.inputs.filter(p => p.type === 'fluid');
      let minFluidSat = 1.0;
      let missingFluidName = '';
      if (fluidInputs.length > 0) {
        fluidInputs.forEach(p => {
          const incomingConns = connList.filter(c => c.toNodeId === node.id && c.toPortId === p.id);
          const receivedRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
          const reqRate = p.rateRequired || 1.0;
          const sat = reqRate > 0 ? Math.min(1.0, receivedRate / reqRate) : 1.0;
          if (sat < minFluidSat) {
            minFluidSat = sat;
            if (sat === 0) missingFluidName = p.name;
          }
        });
        node.fluidSaturation = Number(minFluidSat.toFixed(3));
      } else {
        node.fluidSaturation = 1.0;
      }

      // 4. 檢核固體輸入端口滿足率
      const solidInputs = node.inputs.filter(p => p.type === 'solid');
      let minSolidSat = 1.0;
      let missingSolidName = '';
      if (solidInputs.length > 0) {
        solidInputs.forEach(p => {
          const incomingConns = connList.filter(c => c.toNodeId === node.id && c.toPortId === p.id);
          const receivedRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
          const defaultReq = node.baseCycleTime > 0 ? 1 / node.baseCycleTime : 0.2;
          const reqRate = p.rateRequired !== undefined ? p.rateRequired : defaultReq;
          const sat = reqRate > 0 ? Math.min(1.0, receivedRate / reqRate) : 1.0;
          if (sat < minSolidSat) {
            minSolidSat = sat;
            if (sat === 0) missingSolidName = p.name;
          }
        });
        node.solidSaturation = Number(minSolidSat.toFixed(3));
      } else {
        node.solidSaturation = 1.0;
      }

      // 5. 核心物理：流體欠壓週期拉長 (Cycle Dilation) 與狀態標註
      if (fluidInputs.length > 0 && minFluidSat === 0) {
        node.efficiency = 0;
        node.actualCycleTime = node.baseCycleTime;
        node.statusNote = `❌ 缺少流體：${missingFluidName || '流體斷供'}`;
      } else if (solidInputs.length > 0 && minSolidSat === 0) {
        node.efficiency = 0;
        node.actualCycleTime = node.baseCycleTime;
        node.statusNote = `❌ 缺少原料：${missingSolidName || '固體斷供'}`;
      } else if (minFluidSat < 1.0) {
        // 週期等比例反比拉長
        const dilatedCycle = node.baseCycleTime / minFluidSat;
        node.actualCycleTime = Number(dilatedCycle.toFixed(2));
        node.efficiency = Number((minFluidSat * minSolidSat).toFixed(3));
        node.statusNote = `⚠️ 流體欠壓 ${(minFluidSat * 100).toFixed(0)}%：週期自 ${node.baseCycleTime}s 拉長至 ${node.actualCycleTime}s`;
      } else if (minSolidSat < 1.0) {
        node.actualCycleTime = node.baseCycleTime;
        node.efficiency = Number(minSolidSat.toFixed(3));
        node.statusNote = `⚠️ 固體物料不足 (${(minSolidSat * 100).toFixed(0)}%)`;
      } else {
        node.actualCycleTime = node.baseCycleTime;
        node.efficiency = 1.0;
        node.statusNote = '正常運轉中';
      }

      // 6. 更新輸出端口產率
      node.outputs.forEach(p => {
        const actualOutRate = node.actualCycleTime > 0
          ? (node.baseOutputCount / node.actualCycleTime) * node.efficiency
          : 0;
        p.rateProvided = Number(actualOutRate.toFixed(3));
      });
    });
  }

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
    // 發電機處理 (燃燒煤炭發電，缺燃料時不發電)
    if (n.type === 'generator') {
      const nominalPower = n.powerMode === 'overclock' ? 16.0 : 4.0;
      const actualGen = nominalPower * n.efficiency;
      totalPowerGen += actualGen;
      n.actualPower = actualGen;
      totalPowerLoad += 0;
      totalGoblins += 1;
      return;
    }

    // 泵機處理
    if (n.type === 'pump') {
      totalPowerLoad += n.actualPower || n.basePowerConsumption;
      totalGoblins += n.actualGoblins || n.baseGoblins;
      n.outputs.forEach(p => {
        const name = p.name;
        const rate = p.rateProvided || 0;
        if (name === '水') fluidsSummary.water.produced += rate;
        else if (name === '油') fluidsSummary.oil.produced += rate;
        else if (name === '虛空') fluidsSummary.void.produced += rate;
        else if (name && name !== '流體') {
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
