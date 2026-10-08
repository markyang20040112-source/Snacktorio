import { SandboxNodeData, SandboxConnection } from '../components/Sandbox/sandboxTypes';
import { makeNode } from '../components/Sandbox/sandboxNodeUtils';

/**
 * 環境資源池節點 (無限供液)
 */
export function makePoolNode(id: string, title: string, fluid: string, y: number): SandboxNodeData {
  return makeNode({
    id,
    type: 'environment_pool',
    title,
    x: 60,
    y,
    baseCycleTime: 1,
    baseOutputCount: 999,
    basePowerConsumption: 0,
    baseGoblins: 0,
    inputs: [],
    outputs: [{ id: `out-${fluid}`, name: fluid, type: 'fluid', rateProvided: 999 }]
  });
}

/**
 * 建立獨立自給電網模組（依產線負載動態配置虛空熔爐與採煤機閉環）
 */
export function buildPowerModule(
  dishIndex: number,
  furnaceCount: number,
  coalMinerCount: number,
  coalName: string,
  furnaceMachineName: string,
  minerMachineName: string
): { nodes: SandboxNodeData[]; connections: SandboxConnection[] } {
  const nodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];
  const coalMinerNodes: SandboxNodeData[] = [];

  for (let mIdx = 0; mIdx < coalMinerCount; mIdx++) {
    const minerId = `pwr-coal-${dishIndex}-${mIdx}`;
    const minerNode = makeNode({
      id: minerId,
      type: 'machine',
      title: coalMinerCount > 1 ? `採煤機 #${mIdx + 1} (供煤)` : '採煤機 (供煤)',
      machineName: minerMachineName,
      x: 60,
      y: 80 + mIdx * 180,
      baseCycleTime: 5,
      baseOutputCount: 1,
      basePowerConsumption: 1.0,
      baseGoblins: 1,
      inputs: [],
      outputs: [{ id: `out-${coalName}`, name: coalName, type: 'solid', rateProvided: 0.2 }]
    });
    nodes.push(minerNode);
    coalMinerNodes.push(minerNode);
  }

  for (let fIdx = 0; fIdx < furnaceCount; fIdx++) {
    const genId = `pwr-gen-${dishIndex}-${fIdx}`;
    const genNode = makeNode({
      id: genId,
      type: 'generator',
      title: furnaceCount > 1 ? `虛空熔爐 #${fIdx + 1} (4 FV/s)` : '虛空熔爐 (4 FV/s)',
      machineName: furnaceMachineName,
      powerMode: 'regular',
      x: 200,
      y: 80 + fIdx * 120,
      baseCycleTime: 10,
      baseOutputCount: 1,
      basePowerConsumption: 4.0,
      baseGoblins: 1,
      inputs: [{ id: 'in-coal', name: coalName, type: 'solid', rateRequired: 0.1 }],
      outputs: []
    });
    nodes.push(genNode);

    // Each coal miner (0.2/s) can support up to 2 furnaces (0.1/s each)
    const minerNode = coalMinerNodes[Math.floor(fIdx / 2) % coalMinerNodes.length];
    connections.push({
      id: `c-pwr-coal-${dishIndex}-${fIdx}`,
      fromNodeId: minerNode.id,
      fromPortId: `out-${coalName}`,
      toNodeId: genId,
      toPortId: 'in-coal',
      itemOrFluidName: coalName,
      type: 'solid',
      actualFlowRate: 0.1
    });
  }

  return { nodes, connections };
}

/**
 * 建立環境流體與泵機供應模組（支援超頻階梯與汙泥閉環）
 */
export function buildEnvFluidsModule(
  dishIndex: number,
  neededEnvFluids: Set<string>,
  allNodes: SandboxNodeData[],
  sludgeName: string,
  voidFluidName: string,
  pumpMachineName: string,
  manipulatorMachineName: string
): { nodes: SandboxNodeData[]; connections: SandboxConnection[] } {
  const nodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];
  let envY = 80;

  neededEnvFluids.forEach((fluid) => {
    let totalDemand = 0;
    const consumers: SandboxNodeData[] = [];
    allNodes.forEach(n => {
      n.inputs.forEach(inp => {
        if (inp.type === 'fluid' && inp.name === fluid) {
          totalDemand += (inp.rateRequired || 1.0);
          consumers.push(n);
        }
      });
    });

    if (consumers.length === 0) return;
    const isOc = totalDemand > 2.0;
    const pumpCapacity = isOc ? 8.0 : 2.0;

    const poolId = `pool-${fluid}-${dishIndex}`;
    const pumpId = `pump-${fluid}-${dishIndex}`;

    nodes.push(makePoolNode(poolId, `環境資源：${fluid}池`, fluid, 500 + envY));

    const pumpNode = makeNode({
      id: pumpId,
      type: 'pump',
      title: isOc ? `二級超頻${fluid}泵 (8.0 fl/s)` : `一級常規${fluid}泵 (2.0 fl/s)`,
      machineName: pumpMachineName,
      powerMode: isOc ? 'overclock' : 'regular',
      pumpCapacity: pumpCapacity,
      x: 380,
      y: 500 + envY,
      baseCycleTime: 1,
      baseOutputCount: pumpCapacity,
      basePowerConsumption: 1.0,
      baseGoblins: 0,
      inputs: [
        {
          id: 'in-fluid',
          name: fluid,
          type: 'fluid',
          rateRequired: pumpCapacity
        },
        ...(isOc ? [{
          id: 'in-sludge',
          name: sludgeName,
          type: 'solid' as const,
          rateRequired: 0.2
        }] : [])
      ],
      outputs: [
        {
          id: `out-${fluid}`,
          name: fluid,
          type: 'fluid',
          rateProvided: pumpCapacity
        }
      ]
    });

    nodes.push(pumpNode);

    if (isOc) {
      const sludgeManipId = `sludge-manip-${fluid}-${dishIndex}`;

      const sludgeManip = makeNode({
        id: sludgeManipId,
        type: 'machine',
        title: `${manipulatorMachineName} (供汙泥超頻)`,
        machineName: manipulatorMachineName,
        recipeName: sludgeName,
        x: 620,
        y: 500 + envY + 70,
        baseCycleTime: 5,
        baseOutputCount: 1,
        basePowerConsumption: 2.0,
        baseGoblins: 2,
        inputs: [{ id: `in-fluid-${voidFluidName}`, name: voidFluidName, type: 'fluid', rateRequired: 1.0 }],
        outputs: [{ id: `out-${sludgeName}`, name: sludgeName, type: 'solid', rateProvided: 0.2 }]
      });

      nodes.push(sludgeManip);

      // 汙泥回饋管線：物質操縱機 ➔ 超頻泵機
      connections.push({
        id: `c-oc-sludge-feed-${fluid}-${dishIndex}`,
        fromNodeId: sludgeManipId,
        fromPortId: `out-${sludgeName}`,
        toNodeId: pumpId,
        toPortId: 'in-sludge',
        itemOrFluidName: sludgeName,
        type: 'solid',
        actualFlowRate: 0.2
      });

      if (fluid === voidFluidName) {
        // 最高效率自耗閉環：超頻虛空泵直接分流 1.0 fl/s 虛空給供汙泥操縱機，絕不建立冗餘常規泵與虛空池！
        connections.push({
          id: `c-oc-self-feed-${fluid}-${dishIndex}`,
          fromNodeId: pumpId,
          fromPortId: `out-${voidFluidName}`,
          toNodeId: sludgeManipId,
          toPortId: `in-fluid-${voidFluidName}`,
          itemOrFluidName: voidFluidName,
          type: 'fluid',
          actualFlowRate: 1.0
        });
      } else {
        const ocVoidPoolId = `oc-void-pool-${fluid}-${dishIndex}`;
        const ocVoidPumpId = `oc-void-pump-${fluid}-${dishIndex}`;
        const ocVoidPool = makePoolNode(ocVoidPoolId, '環境資源：虛空裂隙', voidFluidName, 500 + envY + 220);
        const ocVoidPump = makeNode({
          id: ocVoidPumpId,
          type: 'pump',
          title: `常規${voidFluidName}泵 (2.0 fl/s)`,
          machineName: pumpMachineName,
          powerMode: 'regular',
          pumpCapacity: 2.0,
          x: 380,
          y: 500 + envY + 220,
          baseCycleTime: 1,
          baseOutputCount: 2.0,
          basePowerConsumption: 1.0,
          baseGoblins: 0,
          inputs: [{ id: 'in-fluid', name: voidFluidName, type: 'fluid', rateRequired: 2.0 }],
          outputs: [{ id: `out-${voidFluidName}`, name: voidFluidName, type: 'fluid', rateProvided: 2.0 }]
        });
        nodes.push(ocVoidPool, ocVoidPump);
        connections.push(
          {
            id: `c-oc-vpool-pump-${fluid}-${dishIndex}`,
            fromNodeId: ocVoidPoolId,
            fromPortId: `out-${voidFluidName}`,
            toNodeId: ocVoidPumpId,
            toPortId: 'in-fluid',
            itemOrFluidName: voidFluidName,
            type: 'fluid',
            actualFlowRate: 2.0
          },
          {
            id: `c-oc-vpump-manip-${fluid}-${dishIndex}`,
            fromNodeId: ocVoidPumpId,
            fromPortId: `out-${voidFluidName}`,
            toNodeId: sludgeManipId,
            toPortId: `in-fluid-${voidFluidName}`,
            itemOrFluidName: voidFluidName,
            type: 'fluid',
            actualFlowRate: 1.0
          }
        );
      }
    }

    connections.push({
      id: `c-pool-pump-${fluid}-${dishIndex}`,
      fromNodeId: poolId,
      fromPortId: `out-${fluid}`,
      toNodeId: pumpId,
      toPortId: 'in-fluid',
      itemOrFluidName: fluid,
      type: 'fluid',
      actualFlowRate: pumpCapacity
    });

    consumers.forEach(n => {
      const fluidInPort = n.inputs.find(inp => inp.type === 'fluid' && inp.name === fluid);
      if (fluidInPort) {
        connections.push({
          id: `c-pump-${fluid}-to-${n.id}-${dishIndex}`,
          fromNodeId: pumpId,
          fromPortId: `out-${fluid}`,
          toNodeId: n.id,
          toPortId: fluidInPort.id,
          itemOrFluidName: fluid,
          type: 'fluid',
          actualFlowRate: fluidInPort.rateRequired || 1.0
        });
      }
    });

    envY += isOc ? 500 : 340;
  });

  return { nodes, connections };
}

/**
 * 檢查在當前拓撲中是否存在從 fromId 到 toId 的有向路徑（用於防止循環死鎖）
 */
function hasDirectedPath(fromId: string, toId: string, conns: SandboxConnection[]): boolean {
  if (fromId === toId) return true;
  const visited = new Set<string>();
  const queue = [fromId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === toId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (let i = 0; i < conns.length; i++) {
      const c = conns[i];
      if (c.fromNodeId === curr && !visited.has(c.toNodeId)) {
        queue.push(c.toNodeId);
      }
    }
  }
  return false;
}

/**
 * 智慧底料分配器 (Smart Base Material Allocator)：
 * 優先以產線內部中間機台之副產物或多餘產能（如研磨機富餘骨粉）直供物質操縱機底料，消滅冗餘收割機；
 * 嚴禁以【自動廚師機】（終端出餐料理）作為底料，並嚴格防禦循環依賴死鎖。
 * 若無內部多餘產能，則在全廠共用最少台數之底料收割機。
 */
export function allocateSmartBaseMaterials(
  dishIndex: number,
  nodes: SandboxNodeData[],
  connections: SandboxConnection[],
  portUsedCapacity: Map<string, number>,
  baseCropItemName: string,
  isInputConnected: (nodeId: string, portId: string) => boolean,
  pushConn: (...conns: SandboxConnection[]) => void
): void {
  const manipulatorsNeedingBase = nodes.filter(n => n.machineName === '物質操縱機').filter(m => {
    const inBasePort = m.inputs.find(inp => (inp.name === '重構底料' || inp.name === '任意物品' || inp.name === baseCropItemName || inp.id === 'in-base') && !isInputConnected(m.id, inp.id));
    return !!inBasePort;
  });

  let sharedBaseHarvester: SandboxNodeData | null = null;
  let allocCounter = 0;

  manipulatorsNeedingBase.forEach(m => {
    const inBasePort = m.inputs.find(inp => (inp.name === '重構底料' || inp.name === '任意物品' || inp.name === baseCropItemName || inp.id === 'in-base') && !isInputConnected(m.id, inp.id));
    if (!inBasePort) return;

    // 優先級 1：產線中已有且產能過剩的中間加工機台 (例如研磨機富餘產能)
    // 嚴格排除自動廚師機（終端料理絕不可作底料）、原料機台，並防禦循環依賴
    const donorNode = nodes.find(cand => {
      if (cand.id === m.id || cand.type !== 'machine') return false;
      if (
        cand.machineName === '自動廚師機' ||
        cand.machineName === '收割機' ||
        cand.machineName === '採掘機' ||
        cand.machineName === '物質操縱機'
      ) return false;
      // 避免死鎖閉環：若 m 已經是 cand 的上游祖先，則 cand 不能反向供給 m 作為底料
      if (hasDirectedPath(m.id, cand.id, connections)) return false;

      const outP = cand.outputs[0];
      if (!outP || outP.type !== 'solid') return false;
      const portKey = `${cand.id}_${outP.id}`;
      const used = portUsedCapacity.get(portKey) || 0;
      const surplus = (outP.rateProvided || 0.2) - used;
      return surplus > 0.05;
    });

    if (donorNode) {
      const outP = donorNode.outputs[0];
      const portKey = `${donorNode.id}_${outP.id}`;
      const used = portUsedCapacity.get(portKey) || 0;
      const surplus = (outP.rateProvided || 0.2) - used;
      const flowRate = Number(Math.min(inBasePort.rateRequired || 0.2, surplus).toFixed(3));

      pushConn({
        id: `c-surplus-base-${dishIndex}-${m.id}-${donorNode.id}`,
        fromNodeId: donorNode.id,
        fromPortId: outP.id,
        toNodeId: m.id,
        toPortId: inBasePort.id,
        itemOrFluidName: outP.name,
        type: 'solid',
        actualFlowRate: flowRate
      });
      portUsedCapacity.set(portKey, used + flowRate);
      return;
    }

    // 優先級 2：全廠現有收割機中尚有富餘產能者
    const existingHarvester = nodes.find(cand => {
      if (cand.machineName !== '收割機') return false;
      const outP = cand.outputs[0];
      if (!outP) return false;
      const portKey = `${cand.id}_${outP.id}`;
      const used = portUsedCapacity.get(portKey) || 0;
      const surplus = (outP.rateProvided || 0.2) - used;
      return surplus > 0.05;
    });

    if (existingHarvester) {
      const outP = existingHarvester.outputs[0];
      const portKey = `${existingHarvester.id}_${outP.id}`;
      const used = portUsedCapacity.get(portKey) || 0;
      const surplus = (outP.rateProvided || 0.2) - used;
      const flowRate = Number(Math.min(inBasePort.rateRequired || 0.2, surplus).toFixed(3));

      pushConn({
        id: `c-shared-base-${dishIndex}-${m.id}-${existingHarvester.id}`,
        fromNodeId: existingHarvester.id,
        fromPortId: outP.id,
        toNodeId: m.id,
        toPortId: inBasePort.id,
        itemOrFluidName: outP.name,
        type: 'solid',
        actualFlowRate: flowRate
      });
      portUsedCapacity.set(portKey, used + flowRate);
      return;
    }

    // 優先級 3：全廠共用單一底料收割機，絕不重複建立多台
    if (!sharedBaseHarvester) {
      allocCounter++;
      const baseHarvesterId = `heal-base-${dishIndex}-${allocCounter}`;
      sharedBaseHarvester = makeNode({
        id: baseHarvesterId,
        type: 'machine',
        title: `採收：${baseCropItemName}`,
        machineName: '收割機',
        recipeName: baseCropItemName,
        x: m.x - 280,
        y: m.y + 100,
        baseCycleTime: 5,
        baseOutputCount: 1,
        basePowerConsumption: 1.0,
        baseGoblins: 1,
        inputs: [],
        outputs: [{ id: `out-${baseCropItemName}`, name: baseCropItemName, type: 'solid', rateProvided: 0.2 }]
      });
      nodes.push(sharedBaseHarvester);
    }

    pushConn({
      id: `c-heal-base-${dishIndex}-${m.id}`,
      fromNodeId: sharedBaseHarvester.id,
      fromPortId: `out-${baseCropItemName}`,
      toNodeId: m.id,
      toPortId: inBasePort.id,
      itemOrFluidName: baseCropItemName,
      type: 'solid',
      actualFlowRate: inBasePort.rateRequired || 0.2
    });
  });
}
