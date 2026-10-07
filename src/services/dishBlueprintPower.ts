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
      const ocVoidPoolId = `oc-void-pool-${fluid}-${dishIndex}`;
      const ocVoidPumpId = `oc-void-pump-${fluid}-${dishIndex}`;
      const sludgeManipId = `sludge-manip-${fluid}-${dishIndex}`;

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

      const sludgeManip = makeNode({
        id: sludgeManipId,
        type: 'machine',
        title: `${manipulatorMachineName} (供汙泥超頻)`,
        machineName: manipulatorMachineName,
        recipeName: sludgeName,
        x: 700,
        y: 500 + envY + 110,
        baseCycleTime: 5,
        baseOutputCount: 1,
        basePowerConsumption: 2.0,
        baseGoblins: 2,
        inputs: [{ id: `in-fluid-${voidFluidName}`, name: voidFluidName, type: 'fluid', rateRequired: 1.0 }],
        outputs: [{ id: `out-${sludgeName}`, name: sludgeName, type: 'solid', rateProvided: 0.2 }]
      });

      nodes.push(ocVoidPool, ocVoidPump, sludgeManip);

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
        },
        {
          id: `c-oc-sludge-feed-${fluid}-${dishIndex}`,
          fromNodeId: sludgeManipId,
          fromPortId: `out-${sludgeName}`,
          toNodeId: pumpId,
          toPortId: 'in-sludge',
          itemOrFluidName: sludgeName,
          type: 'solid',
          actualFlowRate: 0.2
        }
      );
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
