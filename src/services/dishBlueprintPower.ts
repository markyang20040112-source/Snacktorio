import { SandboxNodeData, SandboxConnection } from '../components/Sandbox/sandboxTypes';
import { makeNode } from '../components/Sandbox/sandboxNodeUtils';
import { FluidTierInfo } from '../types';
import { sizeAutonomousPump, sizeVoidPump } from './plantInfrastructure';
import { dataService } from './dataService';

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
 * 建立環境流體與泵機供應模組（支援超頻階梯與汙泥閉環，與 plantInfrastructure 完全一致）
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

  const machines = dataService.getMachines();
  const pumpSpec = machines.find(m => m.name === pumpMachineName);
  const manipSpec = machines.find(m => m.name === manipulatorMachineName);
  const pumpPower = pumpSpec?.power ?? 1.0;
  const pumpGoblins = pumpSpec?.goblins ?? 1;
  const manipPower = manipSpec?.power ?? 1.0;
  const manipGoblins = manipSpec?.goblins ?? 1;

  // Pass 1：統計各環境流體之消費者與總需量，並依 plantInfrastructure 階梯決策泵機配置
  const consumersMap = new Map<string, SandboxNodeData[]>();
  const demandMap = new Map<string, number>();

  const scanFluidConsumers = (fluid: string) => {
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
    consumersMap.set(fluid, consumers);
    demandMap.set(fluid, totalDemand);
  };

  neededEnvFluids.forEach(fl => scanFluidConsumers(fl));

  const hasVoid = (demandMap.get(voidFluidName) || 0) > 0 ||
    Array.from(demandMap.entries()).some(([fl, d]) => fl !== voidFluidName && d > 6.0);

  const tierMap = new Map<string, FluidTierInfo>();
  let pumpSludgeVoid = 0;
  neededEnvFluids.forEach(fl => {
    if (fl === voidFluidName) return;
    const dem = demandMap.get(fl) || 0;
    const tier = sizeAutonomousPump(dem, hasVoid);
    tierMap.set(fl, tier);
    pumpSludgeVoid += tier.sludgeManipulators * 1.0;
  });

  if (pumpSludgeVoid > 0 && !neededEnvFluids.has(voidFluidName)) {
    neededEnvFluids.add(voidFluidName);
    scanFluidConsumers(voidFluidName);
  }

  if (neededEnvFluids.has(voidFluidName)) {
    const procVoid = demandMap.get(voidFluidName) || 0;
    tierMap.set(voidFluidName, sizeVoidPump(procVoid + pumpSludgeVoid));
  }

  const voidPumps: { node: SandboxNodeData; netRemaining: number }[] = [];
  const pendingVoidSludgeManips: SandboxNodeData[] = [];

  // Pass 2：依原流體順序建立環境池、超頻泵、常規泵與供汙泥物質操縱機
  neededEnvFluids.forEach((fluid) => {
    const consumers = consumersMap.get(fluid) || [];
    const tier = tierMap.get(fluid);
    if (!tier || (tier.overclockPumps + tier.regularPumps === 0)) return;

    const pumpSpecs: { isOc: boolean }[] = [
      ...Array.from({ length: tier.overclockPumps }, () => ({ isOc: true })),
      ...Array.from({ length: tier.regularPumps }, () => ({ isOc: false }))
    ];
    const createdPumps: { node: SandboxNodeData; netRemaining: number }[] = [];

    pumpSpecs.forEach(({ isOc }, pIdx) => {
      const pumpCapacity = isOc ? 8.0 : 2.0;
      const suffix = pIdx === 0 ? `${dishIndex}` : `${dishIndex}-${pIdx}`;
      const poolId = `pool-${fluid}-${suffix}`;
      const pumpId = `pump-${fluid}-${suffix}`;

      nodes.push(makePoolNode(poolId, `環境資源：${fluid}池`, fluid, 500 + envY));

      const pumpNode = makeNode({
        id: pumpId,
        type: 'pump',
        title: isOc ? `二級超頻${fluid}泵 (8.0 fl/s)` : `一級常規${fluid}泵 (2.0 fl/s)`,
        machineName: pumpMachineName,
        powerMode: isOc ? 'overclock' : 'regular',
        pumpCapacity,
        x: 380,
        y: 500 + envY,
        baseCycleTime: 1,
        baseOutputCount: pumpCapacity,
        basePowerConsumption: pumpPower,
        baseGoblins: pumpGoblins,
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
      const netCap = (fluid === voidFluidName && isOc) ? 7.0 : pumpCapacity;
      createdPumps.push({ node: pumpNode, netRemaining: netCap });
      if (fluid === voidFluidName) {
        voidPumps.push({ node: pumpNode, netRemaining: netCap });
      }

      if (isOc) {
        const sludgeManipId = `sludge-manip-${fluid}-${suffix}`;
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
          basePowerConsumption: manipPower,
          baseGoblins: manipGoblins,
          inputs: [{ id: `in-fluid-${voidFluidName}`, name: voidFluidName, type: 'fluid', rateRequired: 1.0 }],
          outputs: [{ id: `out-${sludgeName}`, name: sludgeName, type: 'solid', rateProvided: 0.2 }]
        });

        nodes.push(sludgeManip);

        // 汙泥回饋管線：物質操縱機 ➔ 超頻泵機
        connections.push({
          id: `c-oc-sludge-feed-${fluid}-${suffix}`,
          fromNodeId: sludgeManipId,
          fromPortId: `out-${sludgeName}`,
          toNodeId: pumpId,
          toPortId: 'in-sludge',
          itemOrFluidName: sludgeName,
          type: 'solid',
          actualFlowRate: 0.2
        });

        if (fluid === voidFluidName) {
          // 最高效率自耗閉環：超頻虛空泵直接分流 1.0 fl/s 虛空給供汙泥操縱機
          connections.push({
            id: `c-oc-self-feed-${fluid}-${suffix}`,
            fromNodeId: pumpId,
            fromPortId: `out-${voidFluidName}`,
            toNodeId: sludgeManipId,
            toPortId: `in-fluid-${voidFluidName}`,
            itemOrFluidName: voidFluidName,
            type: 'fluid',
            actualFlowRate: 1.0
          });
        } else {
          pendingVoidSludgeManips.push(sludgeManip);
        }
      }

      connections.push({
        id: `c-pool-pump-${fluid}-${suffix}`,
        fromNodeId: poolId,
        fromPortId: `out-${fluid}`,
        toNodeId: pumpId,
        toPortId: 'in-fluid',
        itemOrFluidName: fluid,
        type: 'fluid',
        actualFlowRate: pumpCapacity
      });

      envY += isOc ? 500 : 340;
    });

    // 將下游流體需求節點依各泵機可用淨容量分配連線
    consumers.forEach(n => {
      const fluidInPort = n.inputs.find(inp => inp.type === 'fluid' && inp.name === fluid);
      if (!fluidInPort) return;
      const req = fluidInPort.rateRequired || 1.0;
      const targetPump = createdPumps.find(p => p.netRemaining >= req - 0.005) || createdPumps[0];
      targetPump.netRemaining -= req;
      connections.push({
        id: `c-pump-${fluid}-to-${n.id}-${dishIndex}`,
        fromNodeId: targetPump.node.id,
        fromPortId: `out-${fluid}`,
        toNodeId: n.id,
        toPortId: fluidInPort.id,
        itemOrFluidName: fluid,
        type: 'fluid',
        actualFlowRate: req
      });
    });
  });

  // 將非虛空超頻泵之供汙泥操縱機連入全廠虛空泵
  pendingVoidSludgeManips.forEach(manip => {
    const voidInPort = manip.inputs.find(inp => inp.type === 'fluid' && inp.name === voidFluidName);
    if (!voidInPort || voidPumps.length === 0) return;
    const req = voidInPort.rateRequired || 1.0;
    const targetPump = voidPumps.find(p => p.netRemaining >= req - 0.005) || voidPumps[0];
    targetPump.netRemaining -= req;
    connections.push({
      id: `c-pump-${voidFluidName}-to-${manip.id}-${dishIndex}`,
      fromNodeId: targetPump.node.id,
      fromPortId: `out-${voidFluidName}`,
      toNodeId: manip.id,
      toPortId: voidInPort.id,
      itemOrFluidName: voidFluidName,
      type: 'fluid',
      actualFlowRate: req
    });
  });

  return { nodes, connections };
}
