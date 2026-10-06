import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxMetrics 
} from './sandboxTypes';

/**
 * 泵機節點專屬物理更新邏輯 (嚴格物料守恆與降載模型)
 * 1. 虛空汙泥超頻判定與降載：額定需求 0.20/s。若供泥不足，依比例降載 (sludgeSat = sludgeRate / 0.20)。
 * 2. 通用泵機液源判定與降載：環境池/注入機依來源稼動率供液；若為其他來源依實質進液量滿足率。
 * 3. 輸出產率嚴格守恆：actualRate = nominalRate * sludgeSat * fluidSat。
 */
function updatePumpNode(
  node: SandboxNodeData,
  connList: SandboxConnection[],
  nodeMap: Map<string, SandboxNodeData>
): void {
  const sludgeConns = connList.filter(c => c.toNodeId === node.id && (c.toPortId === 'in-sludge' || c.toPortId.includes('sludge')));
  const sludgeRate = sludgeConns.reduce((sum, c) => sum + c.actualFlowRate, 0);

  // 只要有接虛空汙泥連線且有流量，即啟用超頻模式（若供泥不足則降載超頻）
  const hasSludgeSupply = sludgeConns.length > 0 && sludgeRate > 0;
  const isOverclocked = hasSludgeSupply;

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
    const incomingConns = connList.filter(c => c.toNodeId === node.id && c.toPortId === fluidInPort.id);
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
    const portOutgoingMap = new Map<string, SandboxConnection[]>();
    connList.forEach(c => {
      const key = `${c.fromNodeId}_${c.fromPortId}`;
      if (!portOutgoingMap.has(key)) {
        portOutgoingMap.set(key, []);
      }
      portOutgoingMap.get(key)!.push(c);
    });

    portOutgoingMap.forEach((conns) => {
      if (conns.length === 0) return;
      const fromNodeId = conns[0].fromNodeId;
      const fromPortId = conns[0].fromPortId;
      const fromNode = nodeMap.get(fromNodeId);
      if (!fromNode) return;

      const outPort = fromNode.outputs.find(p => p.id === fromPortId);
      const totalRate = outPort?.rateProvided || 0;

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
        updatePumpNode(node, connList, nodeMap);
        return;
      }

      // 物品分流器專屬物理 (Splitter)：支援 1 進 2 出 或 1 進 3 出，支援均分模式與自訂流量模式
      if (node.type === 'splitter') {
        const inPort = node.inputs[0];
        const incomingConns = inPort ? connList.filter(c => c.toNodeId === node.id && c.toPortId === inPort.id) : [];
        const inRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
        const outCount = Math.max(1, node.outputs.length);

        if (incomingConns.length > 0 && inRate > 0) {
          const firstConn = incomingConns[0];
          const fromNode = nodeMap.get(firstConn.fromNodeId);
          const fromPort = fromNode?.outputs.find(p => p.id === firstConn.fromPortId);
          const itemName = fromPort?.name || firstConn.itemOrFluidName || '物品';

          node.efficiency = 1.0;
          node.solidSaturation = 1.0;
          node.fluidSaturation = 1.0;
          node.title = `分流器 (${itemName}) · ${outCount}出`;

          if (node.splitterMode === 'custom' && node.splitterCustomRates && node.splitterCustomRates.length === outCount) {
            // 自訂指定流量模式：按自訂限流輸出，超出進料總量則等比降載守恆
            const sumCustom = node.splitterCustomRates.reduce((s, r) => s + r, 0);
            const scale = sumCustom > inRate && sumCustom > 0 ? inRate / sumCustom : 1.0;
            
            node.outputs.forEach((p, idx) => {
              p.name = itemName;
              const target = node.splitterCustomRates![idx] || 0;
              p.rateProvided = Number((target * scale).toFixed(3));
            });

            if (scale < 1.0) {
              node.statusNote = `⚠️ 自訂需求 (${sumCustom.toFixed(2)}/s) 超出進料 (${inRate.toFixed(2)}/s)：已等比降載`;
            } else {
              node.statusNote = `🎯 自訂限流中：進 ${inRate.toFixed(2)}/s，各路 [${node.outputs.map(p => p.rateProvided).join(', ')}]/s`;
            }
          } else {
            // 均分模式：1:1(:1) 均等分流
            const outPerPort = Number((inRate / outCount).toFixed(3));
            node.outputs.forEach(p => {
              p.name = itemName;
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
        const incomingConns = inPort ? connList.filter(c => c.toNodeId === node.id && c.toPortId === inPort.id) : [];
        const inRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);

        if (incomingConns.length > 0 && inRate > 0) {
          const firstConn = incomingConns[0];
          const fromNode = nodeMap.get(firstConn.fromNodeId);
          const fromPort = fromNode?.outputs.find(p => p.id === firstConn.fromPortId);
          const rawName = fromPort?.name || firstConn.itemOrFluidName || '原料';

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
            missingSolidName = p.name;
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
        const solidNote = minSolidSat < 1.0 ? `，且 ${missingSolidName} 不足 (${(minSolidSat * 100).toFixed(0)}%)` : '';
        node.statusNote = `⚠️ 流體欠壓 ${(minFluidSat * 100).toFixed(0)}%：週期自 ${node.baseCycleTime}s 拉長至 ${node.actualCycleTime}s${solidNote}`;
      } else if (minSolidSat < 1.0) {
        node.actualCycleTime = node.baseCycleTime;
        node.efficiency = Number(minSolidSat.toFixed(3));
        node.statusNote = `⚠️ ${missingSolidName || '固體原料'}不足 (${(minSolidSat * 100).toFixed(0)}%)：產能降載至 ${(node.efficiency * 100).toFixed(0)}%`;
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
  const finalPortOutgoingMap = new Map<string, SandboxConnection[]>();
  connList.forEach(c => {
    const key = `${c.fromNodeId}_${c.fromPortId}`;
    if (!finalPortOutgoingMap.has(key)) {
      finalPortOutgoingMap.set(key, []);
    }
    finalPortOutgoingMap.get(key)!.push(c);
  });

  finalPortOutgoingMap.forEach((conns) => {
    if (conns.length === 0) return;
    const fromNodeId = conns[0].fromNodeId;
    const fromPortId = conns[0].fromPortId;
    const fromNode = nodeMap.get(fromNodeId);
    if (!fromNode) return;

    const outPort = fromNode.outputs.find(p => p.id === fromPortId);
    const totalRate = outPort?.rateProvided || 0;

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

    if (fromNode.efficiency === 0) {
      conns.forEach(c => {
        c.actualFlowRate = 0;
      });
      return;
    }

    const splitRate = conns.length > 0 ? totalRate / conns.length : 0;
    conns.forEach(c => {
      c.actualFlowRate = Number(splitRate.toFixed(3));
    });
  });

  // 連線流量最終確定後，對所有泵機進行最終超頻狀態結算 (嚴格守恆降載)
  nodeMap.forEach(node => {
    if (node.type === 'pump') {
      updatePumpNode(node, connList, nodeMap);
    }
  });

  // 最終全機台狀態校準刷新：確保機台 statusNote 與實際連線流量 100% 同步無時序延遲
  nodeMap.forEach(node => {
    if (node.isMockInfiniteSupply || node.type === 'pump' || node.type === 'environment_pool' || node.type === 'splitter' || node.type === 'buffer_decay') return;
    if (node.inputs.length === 0) return;

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
    }

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
          missingSolidName = p.name;
        }
      });
      node.solidSaturation = Number(minSolidSat.toFixed(3));
    }

    if (fluidInputs.length > 0 && minFluidSat === 0) {
      node.efficiency = 0;
      node.actualCycleTime = node.baseCycleTime;
      node.statusNote = `❌ 缺少流體：${missingFluidName || '流體斷供'}`;
    } else if (solidInputs.length > 0 && minSolidSat === 0) {
      node.efficiency = 0;
      node.actualCycleTime = node.baseCycleTime;
      node.statusNote = `❌ 缺少原料：${missingSolidName || '固體斷供'}`;
    } else if (minFluidSat < 1.0) {
      const dilatedCycle = node.baseCycleTime / minFluidSat;
      node.actualCycleTime = Number(dilatedCycle.toFixed(2));
      node.efficiency = Number((minFluidSat * minSolidSat).toFixed(3));
      const solidNote = minSolidSat < 1.0 ? `，且 ${missingSolidName} 不足 (${(minSolidSat * 100).toFixed(0)}%)` : '';
      node.statusNote = `⚠️ 流體欠壓 ${(minFluidSat * 100).toFixed(0)}%：週期自 ${node.baseCycleTime}s 拉長至 ${node.actualCycleTime}s${solidNote}`;
    } else if (minSolidSat < 1.0) {
      node.actualCycleTime = node.baseCycleTime;
      node.efficiency = Number(minSolidSat.toFixed(3));
      node.statusNote = `⚠️ ${missingSolidName || '固體原料'}不足 (${(minSolidSat * 100).toFixed(0)}%)：產能降載至 ${(node.efficiency * 100).toFixed(0)}%`;
    } else {
      node.actualCycleTime = node.baseCycleTime;
      node.efficiency = 1.0;
      node.statusNote = '正常運轉中';
    }

    // 連線收斂後同步最終輸出端口產率
    node.outputs.forEach(p => {
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
      totalPowerLoad += 0;
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
      const power = n.basePowerConsumption;
      totalPowerLoad += power;
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

  fluidsSummary.water.produced = Number(fluidsSummary.water.produced.toFixed(2));
  fluidsSummary.water.consumed = Number(fluidsSummary.water.consumed.toFixed(2));
  fluidsSummary.oil.produced = Number(fluidsSummary.oil.produced.toFixed(2));
  fluidsSummary.oil.consumed = Number(fluidsSummary.oil.consumed.toFixed(2));
  fluidsSummary.void.produced = Number(fluidsSummary.void.produced.toFixed(2));
  fluidsSummary.void.consumed = Number(fluidsSummary.void.consumed.toFixed(2));
  Object.keys(fluidsSummary.custom).forEach(k => {
    fluidsSummary.custom[k].produced = Number(fluidsSummary.custom[k].produced.toFixed(2));
    fluidsSummary.custom[k].consumed = Number(fluidsSummary.custom[k].consumed.toFixed(2));
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
