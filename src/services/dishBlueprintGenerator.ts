import { 
  calculateSingleDish, 
  sortProcessesDownstreamToUpstream,
  getProcessOutputItem,
  getProcessInputItems
} from './solver';
import { dataService } from './dataService';
import { simulateSandboxPhysics } from '../components/Sandbox/sandboxPhysics';
import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxBlueprint,
  PortDefinition 
} from '../components/Sandbox/sandboxTypes';
import { Recipe, IntermediateRecipe, Machine, Item } from '../types';

/**
 * 為指定終端料理全自動推導並建置完整 100% 滿載之沙盒產線藍圖
 * (含採集/採礦、中間工序階層佈局、發電閉環電網、環境池抽取/超頻泵、時序發酵變質緩衝與防衰減流量校準)
 */
export function buildDishBlueprint(
  dish: Recipe, 
  dishIndex: number = 0,
  context?: {
    recipes?: Recipe[];
    items?: Item[];
    intermediate?: IntermediateRecipe[];
    machines?: Machine[];
  }
): SandboxBlueprint {
  const recipes: Recipe[] = context?.recipes || dataService.getRecipes();
  const machines: Machine[] = context?.machines || dataService.getMachines();
  const intermediateRecipes: IntermediateRecipe[] = context?.intermediate || dataService.getIntermediateRecipes();
  const items: Item[] = context?.items || dataService.getItems();

  const allItemsSet = new Set<string>();
  items.forEach(i => allItemsSet.add(i.name));
  recipes.forEach(r => {
    allItemsSet.add(r.name);
    (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
    if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
  });
  intermediateRecipes.forEach(r => {
    allItemsSet.add(r.name);
    (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
    if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
  });

  // Map of spoil product transitions from items.json
  const SPOIL_MAP = new Map<string, { product: string; time: number }>();
  items.forEach(item => {
    if (item.isPerishable && item.spoilProduct) {
      SPOIL_MAP.set(item.name, { product: item.spoilProduct, time: Number(item.spoilTime) || 15 });
    }
  });

  const res = calculateSingleDish(dish.name, 0.2, 'regular', 'dedicated');
  if (!res) {
    throw new Error(`無法解算食譜：${dish.name}`);
  }
  const procs = sortProcessesDownstreamToUpstream(res.processes);

  const nodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];

  // Group processes by topological tier
  const maxTier = Math.max(...procs.map(p => p.tier || 0));

  // 1. Power Module: Generator + Coal Miner
  const genNodeId = `pwr-gen-${dishIndex}`;
  const coalMinerId = `pwr-coal-${dishIndex}`;

  const genNode: SandboxNodeData = {
    id: genNodeId,
    type: 'generator',
    title: '虛空熔爐 (4 FV/s)',
    machineName: '虛空熔爐',
    powerMode: 'regular',
    x: 60,
    y: 80,
    baseCycleTime: 10,
    baseOutputCount: 1,
    basePowerConsumption: 4.0,
    baseGoblins: 1,
    actualCycleTime: 10,
    efficiency: 1.0,
    actualPower: 4.0,
    actualGoblins: 1,
    fluidSaturation: 1.0,
    solidSaturation: 1.0,
    inputs: [{ id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 }],
    outputs: []
  };

  const coalMinerNode: SandboxNodeData = {
    id: coalMinerId,
    type: 'machine',
    title: '採煤機 (供煤)',
    machineName: '採掘機',
    x: 60,
    y: 280,
    baseCycleTime: 5,
    baseOutputCount: 1,
    basePowerConsumption: 1.0,
    baseGoblins: 1,
    actualCycleTime: 5,
    efficiency: 1.0,
    actualPower: 1.0,
    actualGoblins: 1,
    fluidSaturation: 1.0,
    solidSaturation: 1.0,
    inputs: [],
    outputs: [{ id: 'out-煤炭', name: '煤炭', type: 'solid', rateProvided: 0.2 }]
  };

  nodes.push(genNode, coalMinerNode);
  connections.push({
    id: `c-pwr-coal-${dishIndex}`,
    fromNodeId: coalMinerId,
    fromPortId: 'out-煤炭',
    toNodeId: genNodeId,
    toPortId: 'in-coal',
    itemOrFluidName: '煤炭',
    type: 'solid',
    actualFlowRate: 0.1
  });

  // Track needed environment fluids (water, oil, void)
  const neededEnvFluids = new Set<string>();

  // 2. Instantiate Process Nodes
  const procNodeMap = new Map<string, SandboxNodeData>();
  const procOutputMap = new Map<string, { name: string; isFluid: boolean }>();
  const columnCounts = new Map<number, number>();

  procs.forEach((p, pIdx) => {
    const tier = p.tier || 0;
    // tier 0 is rightmost (terminal), maxTier is leftmost
    const colIndex = maxTier - tier + 1; // 1 to maxTier + 1
    const rowInCol = columnCounts.get(colIndex) || 0;
    columnCounts.set(colIndex, rowInCol + 1);

    const x = 360 + colIndex * 340;
    const y = 80 + rowInCol * 260;

    const nodeId = `proc-${dishIndex}-${pIdx}`;
    const outputInfo = getProcessOutputItem(p, dish.name, intermediateRecipes, allItemsSet);
    procOutputMap.set(p.processName, outputInfo);

    let node: SandboxNodeData;

    if (p.machine === '自動廚師機') {
      const inputs: PortDefinition[] = [];
      dish.inputs.forEach(inp => {
        if (inp.name && inp.name !== '無' && inp.count > 0) {
          inputs.push({
            id: `in-${inp.name}`,
            name: inp.name,
            type: 'solid',
            rateRequired: Number((0.2 * inp.count).toFixed(2))
          });
        }
      });
      if (dish.fluidType && dish.fluidType !== '無') {
        inputs.push({
          id: `in-fluid-${dish.fluidType}`,
          name: dish.fluidType,
          type: 'fluid',
          rateRequired: dish.fluidRate || 1.0
        });
        if (['水', '油', '虛空'].includes(dish.fluidType)) {
          neededEnvFluids.add(dish.fluidType);
        }
      }

      node = {
        id: nodeId,
        type: 'machine',
        title: `自動廚師機 (${dish.name})`,
        machineName: '自動廚師機',
        recipeName: dish.name,
        targetRatePerMin: 12,
        x,
        y,
        baseCycleTime: dish.cycleTime || 5,
        baseOutputCount: dish.outputCount || 1,
        basePowerConsumption: 1.0,
        baseGoblins: 3,
        actualCycleTime: dish.cycleTime || 5,
        efficiency: 1.0,
        actualPower: 1.0,
        actualGoblins: 3,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs,
        outputs: [
          {
            id: `out-${dish.name}`,
            name: dish.name,
            type: 'solid',
            rateProvided: Number(((dish.outputCount || 1) / (dish.cycleTime || 5)).toFixed(3))
          }
        ]
      };
    } else {
      const inputInfos = getProcessInputItems(p, dish.name, procs, recipes, intermediateRecipes);
      const inputs: PortDefinition[] = [];

      inputInfos.forEach(inp => {
        // 注入機為原位轉化設備，絕不添加外採輸入管
        if (p.machine === '注入機' && inp.isFluid) return;

        inputs.push({
          id: inp.isFluid ? `in-fluid-${inp.name}` : `in-${inp.name}`,
          name: inp.name,
          type: inp.isFluid ? 'fluid' : 'solid',
          rateRequired: inp.isFluid ? 1.0 : Number((0.2 * (inp.count || 1)).toFixed(2))
        });
        if (inp.isFluid && ['水', '油', '虛空'].includes(inp.name)) {
          neededEnvFluids.add(inp.name);
        }
      });

      // Special handling for 物質操縱機
      if (p.machine === '物質操縱機') {
        neededEnvFluids.add('虛空');
        if (!inputs.some(inp => inp.name === '虛空')) {
          inputs.push({
            id: 'in-fluid-虛空',
            name: '虛空',
            type: 'fluid',
            rateRequired: 1.0
          });
        }
        if (!inputs.some(inp => inp.name === '重構底料' || inp.name === '任意物品')) {
          inputs.push({
            id: 'in-base',
            name: '重構底料',
            type: 'solid',
            rateRequired: 0.2
          });
        }
      }

      // Check if machine requires fluid from inter definition (not machine default!)
      const inter = intermediateRecipes.find(r => r.name === p.processName || r.name === outputInfo.name);
      if (inter && inter.fluidType && ['水', '油', '虛空'].includes(inter.fluidType) && p.machine !== '注入機') {
        neededEnvFluids.add(inter.fluidType);
        if (!inputs.some(inp => inp.name === inter.fluidType)) {
          inputs.push({
            id: `in-fluid-${inter.fluidType}`,
            name: inter.fluidType,
            type: 'fluid',
            rateRequired: inter.fluidRate || 1.0
          });
        }
      }

      // For fluid machines (like 攪拌機), default rate is 1.0 fl/s! For solid machines, capacity adapts to downstream demand
      const isFluidMach = outputInfo.isFluid;
      const initialRate = isFluidMach ? 1.0 : Math.max(0.2, (p.countRounded || 1) * (p.baseRate || 0.2));

      const mObj = machines.find(m => m.name === p.machine);
      const machPower = mObj?.power || p.power || 1.0;
      const machGoblins = mObj?.goblins || p.goblins || 1;

      node = {
        id: nodeId,
        type: 'machine',
        title: `${p.processName} (${p.machine})`,
        machineName: p.machine,
        recipeName: outputInfo.name,
        x,
        y,
        baseCycleTime: 5,
        baseOutputCount: Number((initialRate * 5).toFixed(2)),
        basePowerConsumption: machPower,
        baseGoblins: machGoblins,
        actualCycleTime: 5,
        efficiency: 1.0,
        actualPower: machPower,
        actualGoblins: machGoblins,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs,
        outputs: [
          {
            id: `out-${outputInfo.name}`,
            name: outputInfo.name,
            type: isFluidMach ? 'fluid' : 'solid',
            rateProvided: Number(initialRate.toFixed(2))
          }
        ]
      };
    }

    nodes.push(node);
    procNodeMap.set(p.processName, node);
  });

  // 3. Connect Upstream Producers to Downstream Consumers with Decay Buffers
  const decayBuffers: SandboxNodeData[] = [];

  procs.forEach((p, pIdx) => {
    const fromNode = procNodeMap.get(p.processName)!;
    const outputInfo = procOutputMap.get(p.processName)!;

    (p.downstreamTargets || []).forEach((target, tIdx) => {
      let targetNodeName = target.processName;
      if (target.machine === '自動廚師機' || target.processName === dish.name) {
        targetNodeName = procs.find(pr => pr.machine === '自動廚師機')?.processName || '';
      }
      const toNode = procNodeMap.get(targetNodeName);
      if (!toNode) return;

      const toPort = toNode.inputs.find(inp => 
        inp.name === outputInfo.name || 
        (inp.name === '重構底料' && (outputInfo.name === '底料專供' || outputInfo.name === '底料'))
      );

      // Check if this material undergoes spoil/fermentation to become toPort's requirement
      let decayPath: string[] = [];
      if (!toPort) {
        // Check 1-step decay
        const s1 = SPOIL_MAP.get(outputInfo.name);
        if (s1 && toNode.inputs.some(inp => inp.name === s1.product)) {
          decayPath = [s1.product];
        } else if (s1) {
          // Check 2-step decay
          const s2 = SPOIL_MAP.get(s1.product);
          if (s2 && toNode.inputs.some(inp => inp.name === s2.product)) {
            decayPath = [s1.product, s2.product];
          }
        }
      }

      if (toPort) {
        // Direct Connection
        connections.push({
          id: `c-${dishIndex}-${pIdx}-${tIdx}`,
          fromNodeId: fromNode.id,
          fromPortId: fromNode.outputs[0].id,
          toNodeId: toNode.id,
          toPortId: toPort.id,
          itemOrFluidName: outputInfo.name,
          type: outputInfo.isFluid ? 'fluid' : 'solid',
          actualFlowRate: toPort.rateRequired || 0.2
        });
      } else if (decayPath.length > 0) {
        // Insert Decay Buffer Nodes along the path
        let prevNode = fromNode;
        let prevPortId = fromNode.outputs[0].id;
        let currentItem = outputInfo.name;

        decayPath.forEach((nextItem, dStep) => {
          const perishInfo = SPOIL_MAP.get(currentItem) || { time: 15 };
          const bufferId = `decay-${dishIndex}-${pIdx}-${tIdx}-${dStep}`;
          const bufNode: SandboxNodeData = {
            id: bufferId,
            type: 'buffer_decay',
            title: `發酵：${currentItem} ➔ ${nextItem}`,
            machineName: '發酵緩衝',
            recipeName: nextItem,
            x: (prevNode.x + toNode.x) / 2 + (dStep * 100),
            y: (prevNode.y + toNode.y) / 2 + (dStep * 60),
            baseCycleTime: perishInfo.time,
            baseOutputCount: 1,
            basePowerConsumption: 0,
            baseGoblins: 0,
            actualCycleTime: perishInfo.time,
            efficiency: 1.0,
            actualPower: 0,
            actualGoblins: 0,
            fluidSaturation: 1.0,
            solidSaturation: 1.0,
            inputs: [
              { id: 'in-item', name: currentItem, type: 'solid', rateRequired: 0.2 }
            ],
            outputs: [
              { id: 'out-item', name: nextItem, type: 'solid', rateProvided: 0.2 }
            ]
          };

          nodes.push(bufNode);
          decayBuffers.push(bufNode);

          connections.push({
            id: `c-decay-in-${dishIndex}-${pIdx}-${tIdx}-${dStep}`,
            fromNodeId: prevNode.id,
            fromPortId: prevPortId,
            toNodeId: bufNode.id,
            toPortId: 'in-item',
            itemOrFluidName: currentItem,
            type: 'solid',
            actualFlowRate: 0.2
          });

          prevNode = bufNode;
          prevPortId = 'out-item';
          currentItem = nextItem;
        });

        // Finally connect to downstream consumer
        const finalInPort = toNode.inputs.find(inp => inp.name === currentItem);
        if (finalInPort) {
          connections.push({
            id: `c-decay-out-${dishIndex}-${pIdx}-${tIdx}`,
            fromNodeId: prevNode.id,
            fromPortId: prevPortId,
            toNodeId: toNode.id,
            toPortId: finalInPort.id,
            itemOrFluidName: currentItem,
            type: 'solid',
            actualFlowRate: finalInPort.rateRequired || 0.2
          });
        }
      }
    });

    // Handle Feeder base for 物質操縱機
    if (p.feederRole === 'donor' || p.processName.includes('底料')) {
      const manipulatorNode = Array.from(procNodeMap.values()).find(n => n.machineName === '物質操縱機');
      if (manipulatorNode) {
        const inBasePort = manipulatorNode.inputs.find(inp => inp.name === '重構底料' || inp.name === '任意物品');
        if (inBasePort && !connections.some(c => c.toNodeId === manipulatorNode.id && c.toPortId === inBasePort.id)) {
          connections.push({
            id: `c-feeder-base-${dishIndex}-${pIdx}`,
            fromNodeId: fromNode.id,
            fromPortId: fromNode.outputs[0].id,
            toNodeId: manipulatorNode.id,
            toPortId: inBasePort.id,
            itemOrFluidName: outputInfo.name,
            type: 'solid',
            actualFlowRate: 0.2
          });
        }
      }
    }
  });

  // 4. Fallback Auto-Healing: Any consumer inputs still missing?
  nodes.forEach((consumer, cIdx) => {
    consumer.inputs.forEach((inPort, pIdx) => {
      if (inPort.type === 'fluid') return; // Handled by environment pools / pumps
      const hasInConn = connections.some(c => c.toNodeId === consumer.id && c.toPortId === inPort.id);
      if (!hasInConn) {
        // Find existing producer or decay buffer on canvas
        const producer = nodes.find(n => 
          n.id !== consumer.id && 
          n.outputs.some(out => out.name === inPort.name || (inPort.name === '重構底料' && (out.name === '底料' || out.name === '底料專供' || out.name === '日桂葉')))
        );

        if (producer) {
          const outPort = producer.outputs.find(out => out.name === inPort.name || (inPort.name === '重構底料' && (out.name === '底料' || out.name === '底料專供' || out.name === '日桂葉')))!;
          connections.push({
            id: `c-heal-${dishIndex}-${cIdx}-${pIdx}`,
            fromNodeId: producer.id,
            fromPortId: outPort.id,
            toNodeId: consumer.id,
            toPortId: inPort.id,
            itemOrFluidName: outPort.name,
            type: 'solid',
            actualFlowRate: inPort.rateRequired || 0.2
          });
        } else {
          // Dedicated Harvester / Miner Node
          const itemDef = items.find(it => it.name === inPort.name);
          const isMineral = itemDef?.source?.includes('礦') || ['煤炭', '鹽', '石英', '方糖', '鐵礦石'].includes(inPort.name);
          const healMachName = isMineral ? '採掘機' : '收割機';
          const healTitle = `${healMachName} (${inPort.name})`;
          const healNodeId = `heal-miner-${dishIndex}-${cIdx}-${pIdx}`;

          const healNode: SandboxNodeData = {
            id: healNodeId,
            type: 'machine',
            title: healTitle,
            machineName: healMachName,
            recipeName: inPort.name,
            x: consumer.x - 300,
            y: consumer.y + 120,
            baseCycleTime: 5,
            baseOutputCount: 1,
            basePowerConsumption: 1.0,
            baseGoblins: 1,
            actualCycleTime: 5,
            efficiency: 1.0,
            actualPower: 1.0,
            actualGoblins: 1,
            fluidSaturation: 1.0,
            solidSaturation: 1.0,
            inputs: [],
            outputs: [
              {
                id: `out-${inPort.name}`,
                name: inPort.name,
                type: 'solid',
                rateProvided: 0.2
              }
            ]
          };

          nodes.push(healNode);
          connections.push({
            id: `c-heal-direct-${dishIndex}-${cIdx}-${pIdx}`,
            fromNodeId: healNode.id,
            fromPortId: `out-${inPort.name}`,
            toNodeId: consumer.id,
            toPortId: inPort.id,
            itemOrFluidName: inPort.name,
            type: 'solid',
            actualFlowRate: inPort.rateRequired || 0.2
          });
        }
      }
    });
  });

  // 5. Build Environment Fluids & Pumps
  let envY = 80;
  neededEnvFluids.forEach((fluid) => {
    // Total demand for this fluid across all consumer nodes
    let totalDemand = 0;
    const consumers: SandboxNodeData[] = [];
    nodes.forEach(n => {
      n.inputs.forEach(inp => {
        if (inp.type === 'fluid' && inp.name === fluid) {
          totalDemand += (inp.rateRequired || 1.0);
          consumers.push(n);
        }
      });
    });

    if (consumers.length === 0) return;

    // Overclocking threshold: > 2 fl/s
    const isOc = totalDemand > 2.0;
    const pumpCapacity = isOc ? 8.0 : 2.0;

    const poolId = `pool-${fluid}-${dishIndex}`;
    const pumpId = `pump-${fluid}-${dishIndex}`;

    // Environment Pool
    const poolNode: SandboxNodeData = {
      id: poolId,
      type: 'environment_pool',
      title: `環境資源：${fluid}池`,
      x: 60,
      y: 500 + envY,
      baseCycleTime: 1,
      baseOutputCount: 999,
      basePowerConsumption: 0,
      baseGoblins: 0,
      actualCycleTime: 1,
      efficiency: 1.0,
      actualPower: 0,
      actualGoblins: 0,
      fluidSaturation: 1.0,
      solidSaturation: 1.0,
      inputs: [],
      outputs: [
        {
          id: `out-${fluid}`,
          name: fluid,
          type: 'fluid',
          rateProvided: 999
        }
      ]
    };

    // Pump
    const pumpNode: SandboxNodeData = {
      id: pumpId,
      type: 'pump',
      title: isOc ? `二級超頻${fluid}泵 (8.0 fl/s)` : `一級常規${fluid}泵 (2.0 fl/s)`,
      machineName: '泵機',
      powerMode: isOc ? 'overclock' : 'regular',
      pumpCapacity: pumpCapacity,
      x: 380,
      y: 500 + envY,
      baseCycleTime: 1,
      baseOutputCount: pumpCapacity,
      basePowerConsumption: 1.0,
      baseGoblins: 0,
      actualCycleTime: 1,
      efficiency: 1.0,
      actualPower: 1.0,
      actualGoblins: 0,
      fluidSaturation: 1.0,
      solidSaturation: 1.0,
      inputs: [
        {
          id: 'in-fluid',
          name: fluid,
          type: 'fluid',
          rateRequired: pumpCapacity
        },
        ...(isOc ? [{
          id: 'in-sludge',
          name: '虛空汙泥',
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
    };

    nodes.push(poolNode, pumpNode);

    // If overclocked, build void pool + void pump + 物質操縱機 to feed 虛空汙泥
    if (isOc) {
      const ocVoidPoolId = `oc-void-pool-${fluid}-${dishIndex}`;
      const ocVoidPumpId = `oc-void-pump-${fluid}-${dishIndex}`;
      const sludgeManipId = `sludge-manip-${fluid}-${dishIndex}`;

      const ocVoidPool: SandboxNodeData = {
        id: ocVoidPoolId,
        type: 'environment_pool',
        title: '環境資源：虛空裂隙',
        x: 60,
        y: 500 + envY + 220,
        baseCycleTime: 1,
        baseOutputCount: 999,
        basePowerConsumption: 0,
        baseGoblins: 0,
        actualCycleTime: 1,
        efficiency: 1.0,
        actualPower: 0,
        actualGoblins: 0,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: [],
        outputs: [{ id: 'out-虛空', name: '虛空', type: 'fluid', rateProvided: 999 }]
      };

      const ocVoidPump: SandboxNodeData = {
        id: ocVoidPumpId,
        type: 'pump',
        title: '常規虛空泵 (2.0 fl/s)',
        machineName: '泵機',
        powerMode: 'regular',
        pumpCapacity: 2.0,
        x: 380,
        y: 500 + envY + 220,
        baseCycleTime: 1,
        baseOutputCount: 2.0,
        basePowerConsumption: 1.0,
        baseGoblins: 0,
        actualCycleTime: 1,
        efficiency: 1.0,
        actualPower: 1.0,
        actualGoblins: 0,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: [{ id: 'in-fluid', name: '虛空', type: 'fluid', rateRequired: 2.0 }],
        outputs: [{ id: 'out-虛空', name: '虛空', type: 'fluid', rateProvided: 2.0 }]
      };

      const sludgeManip: SandboxNodeData = {
        id: sludgeManipId,
        type: 'machine',
        title: '物質操縱機 (供汙泥超頻)',
        machineName: '物質操縱機',
        recipeName: '虛空汙泥',
        x: 700,
        y: 500 + envY + 110,
        baseCycleTime: 5,
        baseOutputCount: 1,
        basePowerConsumption: 2.0,
        baseGoblins: 2,
        actualCycleTime: 5,
        efficiency: 1.0,
        actualPower: 2.0,
        actualGoblins: 2,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: [{ id: 'in-fluid-虛空', name: '虛空', type: 'fluid', rateRequired: 1.0 }],
        outputs: [{ id: 'out-虛空汙泥', name: '虛空汙泥', type: 'solid', rateProvided: 0.2 }]
      };

      nodes.push(ocVoidPool, ocVoidPump, sludgeManip);

      connections.push(
        {
          id: `c-oc-vpool-pump-${fluid}-${dishIndex}`,
          fromNodeId: ocVoidPoolId,
          fromPortId: 'out-虛空',
          toNodeId: ocVoidPumpId,
          toPortId: 'in-fluid',
          itemOrFluidName: '虛空',
          type: 'fluid',
          actualFlowRate: 2.0
        },
        {
          id: `c-oc-vpump-manip-${fluid}-${dishIndex}`,
          fromNodeId: ocVoidPumpId,
          fromPortId: 'out-虛空',
          toNodeId: sludgeManipId,
          toPortId: 'in-fluid-虛空',
          itemOrFluidName: '虛空',
          type: 'fluid',
          actualFlowRate: 1.0
        },
        {
          id: `c-oc-sludge-feed-${fluid}-${dishIndex}`,
          fromNodeId: sludgeManipId,
          fromPortId: 'out-虛空汙泥',
          toNodeId: pumpId,
          toPortId: 'in-sludge',
          itemOrFluidName: '虛空汙泥',
          type: 'solid',
          actualFlowRate: 0.2
        }
      );
    }

    // Connect pool to pump
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

    // Connect pump to consumers strictly needing this fluid
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

  // 6. Calibrate Output Port Capacities to Match Multiple Outgoing Connections
  nodes.forEach(n => {
    n.outputs.forEach(outPort => {
      const outConns = connections.filter(c => c.fromNodeId === n.id && c.fromPortId === outPort.id);
      if (outConns.length > 1) {
        let totalReq = 0;
        outConns.forEach(c => {
          const targetN = nodes.find(target => target.id === c.toNodeId);
          const inP = targetN?.inputs.find(p => p.id === c.toPortId);
          totalReq += (inP?.rateRequired || (outPort.type === 'fluid' ? 1.0 : 0.2));
        });
        const safeRate = Number((outConns.length * Math.max(outPort.type === 'fluid' ? 1.0 : 0.2, totalReq / outConns.length)).toFixed(2));
        outPort.rateProvided = safeRate;
        n.baseOutputCount = Number((safeRate * n.baseCycleTime).toFixed(2));
      }
    });
  });

  // 7. Physics Simulation Verification
  const sim = simulateSandboxPhysics(nodes, connections);

  const blueprint: SandboxBlueprint = {
    id: `bp_dish_${dishIndex + 1}_${dish.name.replace(/\s+/g, '_')}`,
    name: `${dish.name} (標準產能 12份/分)`,
    description: `【${dish.island || '未知島嶼'}】${dish.name} 完整自動化產線：包含原料採集、中間加工、專屬流體輸送與 4 FV/s 獨立發電閉環。`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pan: { x: 50, y: 50 },
    zoom: 0.85,
    stats: {
      machineCount: nodes.filter(n => n.type === 'machine' || n.type === 'generator' || n.type === 'pump').length,
      powerLoad: Number(sim.metrics.totalPowerLoad.toFixed(2)),
      mainDishes: [dish.name]
    },
    nodes: sim.updatedNodes,
    connections: sim.updatedConnections
  };

  return blueprint;
}
