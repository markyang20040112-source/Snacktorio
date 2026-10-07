import { 
  calculateSingleDish, 
  sortProcessesDownstreamToUpstream,
  getProcessOutputItem,
  getProcessInputItems,
  isScorchingDish
} from './solver';
import { dataService } from './dataService';
import { simulateSandboxPhysics } from '../components/Sandbox/sandboxPhysics';
import { makeNode } from '../components/Sandbox/sandboxNodeUtils';
import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxBlueprint,
  PortDefinition 
} from '../components/Sandbox/sandboxTypes';
import { Recipe, IntermediateRecipe, Machine, Item } from '../types';
import { ENV_FLUIDS, rawSourceMachine } from '../utils/itemTraits';
import { buildPowerModule, buildEnvFluidsModule } from './dishBlueprintPower';

/**
 * 為指定終端料理全自動推導並建置完整 100% 滿載且無虛假產能之真實沙盒產線藍圖
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

  // Dynamic derivation of standard base crop item (defaults to crop with '底料' attribute, then basic leaf crop, then Pomora crop, then first harvester crop)
  const baseCropItem = items.find(it => it.attributes?.includes('底料'))
    || items.find(it => it.source === '收割機' && it.name.includes('桂'))
    || items.find(it => it.source === '收割機' && it.island.includes('波莫拉'))
    || items.find(it => it.source === '收割機');
  const baseCropItemName = baseCropItem?.name || '';
  // Dynamic derivation of remedy recipe for scorching dishes (defaults to recipe with '中和' & '熾熱/炙熱')
  const remedyRecipe = recipes.find(r => r.notes?.includes('中和') && (r.notes?.includes('熾熱') || r.notes?.includes('炙熱')));
  const remedyDishName = remedyRecipe?.name || '';

  const allItemsSet = new Set<string>();
  items.forEach(i => allItemsSet.add(i.name));
  [...recipes, ...intermediateRecipes].forEach(r => {
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

  /** 自癒補料：依 items.json 物品來源判定原料機台 (物質操縱機 / 採掘機 / 收割機) */
  const classifyRawSource = (name: string) => {
    const machName = rawSourceMachine(items.find(it => it.name === name));
    return { isRecon: machName === '物質操縱機', machName };
  };

  /** 物質操縱機之標準輸入端口 (虛空 + 任意物品) */
  const reconInputs = (): PortDefinition[] => [
    { id: 'in-fluid-虛空', name: '虛空', type: 'fluid', rateRequired: 1.0 },
    { id: 'in-base', name: '任意物品', type: 'solid', rateRequired: 0.2 }
  ];

  const res = calculateSingleDish(dish.name, 0.2, 'regular', 'dedicated');
  if (!res) {
    throw new Error(`無法解算食譜：${dish.name}`);
  }

  const procs = sortProcessesDownstreamToUpstream(res.processes);

  const nodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];

  // 已連線之輸入端口索引 (節點 ID + 端口 ID)，與 connections 同步維護
  const connectedInputs = new Set<string>();
  const inputKey = (nodeId: string, portId: string) => `${nodeId}\u0000${portId}`;
  const pushConn = (...conns: SandboxConnection[]) => {
    conns.forEach(c => {
      connections.push(c);
      connectedInputs.add(inputKey(c.toNodeId, c.toPortId));
    });
  };
  const isInputConnected = (nodeId: string, portId: string) => connectedInputs.has(inputKey(nodeId, portId));

  // Group processes by topological tier
  const maxTier = Math.max(...procs.map(p => p.tier || 0));

  // 1. Power Module: Generators + Coal Miners (Scaled dynamically according to powerGrid)
  const furnaceCount = res.powerGrid?.furnaces || 1;
  const coalMinerCount = res.powerGrid?.coalMiners || Math.ceil(furnaceCount / 2);
  const powerMod = buildPowerModule(dishIndex, furnaceCount, coalMinerCount, '煤炭', '虛空熔爐', '採掘機');
  nodes.push(...powerMod.nodes);
  pushConn(...powerMod.connections);

  const neededEnvFluids = new Set<string>();
  const procNodesMap = new Map<string, SandboxNodeData[]>();
  const procOutputMap = new Map<string, { name: string; isFluid: boolean }>();
  const columnCounts = new Map<number, number>();

  // 2. Instantiate Process Nodes with strict physical machine counts
  procs.forEach((p, pIdx) => {
    const tier = p.tier || 0;
    const colIndex = maxTier - tier + 1;
    const outputInfo = getProcessOutputItem(p, dish.name, intermediateRecipes, allItemsSet);
    procOutputMap.set(p.processName, outputInfo);

    const instancesCount = Math.max(1, p.countRounded || 1);
    const instanceList: SandboxNodeData[] = [];

    for (let instIdx = 0; instIdx < instancesCount; instIdx++) {
      const rowInCol = columnCounts.get(colIndex) || 0;
      columnCounts.set(colIndex, rowInCol + 1);

      const x = 360 + colIndex * 340;
      const y = 80 + rowInCol * 240;
      const nodeId = `proc-${dishIndex}-${pIdx}-${instIdx}`;

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
          if (ENV_FLUIDS.includes(dish.fluidType)) {
            neededEnvFluids.add(dish.fluidType);
          }
        }

        node = makeNode({
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
          inputs,
          outputs: [
            {
              id: `out-${dish.name}`,
              name: dish.name,
              type: 'solid',
              rateProvided: Number(((dish.outputCount || 1) / (dish.cycleTime || 5)).toFixed(3))
            }
          ]
        });
      } else {
        const inputInfos = getProcessInputItems(p, dish.name, procs, recipes, intermediateRecipes);
        const inputs: PortDefinition[] = [];

        const interDef = intermediateRecipes.find(r => r.name === p.processName || r.name === outputInfo.name);
        const machCycleTime = interDef?.cycleTime || 5;

        inputInfos.forEach(inp => {
          if (p.machine === '注入機' && inp.isFluid) return;
          if (!inp.name || inp.name === '無') return;
          const solidReq = Number(((inp.count || 1) / machCycleTime).toFixed(3));
          inputs.push({
            id: inp.isFluid ? `in-fluid-${inp.name}` : `in-${inp.name}`,
            name: inp.name,
            type: inp.isFluid ? 'fluid' : 'solid',
            rateRequired: inp.isFluid ? 1.0 : solidReq
          });
          if (inp.isFluid && ENV_FLUIDS.includes(inp.name)) {
            neededEnvFluids.add(inp.name);
          }
        });

        if (p.machine === '物質操縱機') {
          neededEnvFluids.add('虛空');
          if (!inputs.some(inp => inp.name === '虛空')) {
            inputs.push({ id: 'in-fluid-虛空', name: '虛空', type: 'fluid', rateRequired: 1.0 });
          }
          if (!inputs.some(inp => inp.name === '任意物品' || inp.name === '重構底料' || inp.id === 'in-base')) {
            inputs.push({ id: 'in-base', name: '任意物品', type: 'solid', rateRequired: 0.2 });
          }
        }

        if (interDef && interDef.fluidType && ENV_FLUIDS.includes(interDef.fluidType) && p.machine !== '注入機') {
          neededEnvFluids.add(interDef.fluidType);
          if (!inputs.some(inp => inp.name === interDef.fluidType)) {
            inputs.push({ id: `in-fluid-${interDef.fluidType}`, name: interDef.fluidType, type: 'fluid', rateRequired: interDef.fluidRate || 1.0 });
          }
        }

        const isFluidMach = outputInfo.isFluid;
        const machOutputCount = interDef?.outputCount || (outputInfo.name === '泥沼蟑螂' ? 2 : 1);
        const machRate = p.machine === '注入機' ? 999 : (isFluidMach ? 1.0 : Number((machOutputCount / machCycleTime).toFixed(3)));

        const mObj = machines.find(m => m.name === p.machine);
        const machPower = mObj?.power || p.power || 1.0;
        const machGoblins = mObj?.goblins || p.goblins || 1;

        const subTitle = instancesCount > 1 ? ` #${instIdx + 1}` : '';

        node = makeNode({
          id: nodeId,
          type: 'machine',
          title: `${p.processName}${subTitle} (${p.machine})`,
          machineName: p.machine,
          recipeName: outputInfo.name,
          x,
          y,
          baseCycleTime: machCycleTime,
          baseOutputCount: machOutputCount,
          basePowerConsumption: machPower,
          baseGoblins: machGoblins,
          inputs,
          outputs: [
            {
              id: `out-${outputInfo.name}`,
              name: outputInfo.name,
              type: isFluidMach ? 'fluid' : 'solid',
              rateProvided: machRate
            }
          ]
        });
      }

      nodes.push(node);
      instanceList.push(node);
    }
    procNodesMap.set(p.processName, instanceList);
  });

  // Track port usage
  const portUsedCapacity = new Map<string, number>();

  // 3. Connect Upstream to Downstream
  procs.forEach((p, pIdx) => {
    const fromNodes = procNodesMap.get(p.processName)!;
    const outputInfo = procOutputMap.get(p.processName)!;

    (p.downstreamTargets || []).forEach((target, tIdx) => {
      let targetNodeName = target.processName;
      if (target.machine === '自動廚師機' || target.processName === dish.name) {
        targetNodeName = procs.find(pr => pr.machine === '自動廚師機')?.processName || '';
      }
      const toNodes = procNodesMap.get(targetNodeName);
      if (!toNodes || toNodes.length === 0) return;

      // Match target to a fromNode instance and toNode instance
      const fromNode = fromNodes[tIdx % fromNodes.length];
      const outPort = fromNode.outputs[0];
      if (!outPort) return;

      // Find a toNode that still needs this input
      const toNode = toNodes.find(tn => {
        const pInp = tn.inputs.find(inp => 
          inp.name === outputInfo.name || 
          ((inp.name === '重構底料' || inp.name === '任意物品' || inp.name === baseCropItemName) && (outputInfo.name === '底料專供' || outputInfo.name === '底料' || outputInfo.name === baseCropItemName))
        );
        return pInp && !isInputConnected(tn.id, pInp.id);
      }) || toNodes[0];

      const toPort = toNode.inputs.find(inp => 
        inp.name === outputInfo.name || 
        ((inp.name === '重構底料' || inp.name === '任意物品' || inp.name === baseCropItemName) && (outputInfo.name === '底料專供' || outputInfo.name === '底料' || outputInfo.name === baseCropItemName))
      );

      let decayPath: string[] = [];
      if (!toPort) {
        const s1 = SPOIL_MAP.get(outputInfo.name);
        if (s1 && toNode.inputs.some(inp => inp.name === s1.product)) {
          decayPath = [s1.product];
        } else if (s1) {
          const s2 = SPOIL_MAP.get(s1.product);
          if (s2 && toNode.inputs.some(inp => inp.name === s2.product)) {
            decayPath = [s1.product, s2.product];
          }
        }
      }

      const reqRate = toPort?.rateRequired || 0.2;
      const portKey = `${fromNode.id}_${outPort.id}`;
      const used = portUsedCapacity.get(portKey) || 0;
      const availableCap = Math.max(0, (outPort.rateProvided || 0.2) - used);
      const isFluidConnection = outputInfo.isFluid || fromNode.machineName === '注入機';
      const canServe = isFluidConnection || availableCap > 0.001;

      if (toPort && canServe) {
        const flowRate = isFluidConnection ? reqRate : Math.min(reqRate, availableCap);
        pushConn({
          id: `c-${dishIndex}-${pIdx}-${tIdx}`,
          fromNodeId: fromNode.id,
          fromPortId: outPort.id,
          toNodeId: toNode.id,
          toPortId: toPort.id,
          itemOrFluidName: outputInfo.name,
          type: outputInfo.isFluid ? 'fluid' : 'solid',
          actualFlowRate: flowRate
        });
        portUsedCapacity.set(portKey, used + flowRate);
      } else if (decayPath.length > 0 && canServe) {

        let prevNode = fromNode;
        let prevPortId = outPort.id;
        let currentItem = outputInfo.name;

        decayPath.forEach((nextItem, dStep) => {
          const perishInfo = SPOIL_MAP.get(currentItem) || { time: 15 };
          const bufferId = `decay-${dishIndex}-${pIdx}-${tIdx}-${dStep}`;
          const bufNode = makeNode({
            id: bufferId,
            type: 'buffer_decay',
            title: `發酵緩衝 (${currentItem} ➔ ${nextItem})`,
            machineName: '發酵緩衝',
            recipeName: nextItem,
            x: (fromNode.x + toNode.x) / 2 + dStep * 140,
            y: (fromNode.y + toNode.y) / 2 + dStep * 80,
            baseCycleTime: perishInfo.time,

            baseOutputCount: 1,
            basePowerConsumption: 0,
            baseGoblins: 0,
            inputs: [{ id: `in-${currentItem}`, name: currentItem, type: 'solid' }],
            outputs: [{ id: `out-${nextItem}`, name: nextItem, type: 'solid', rateProvided: 0.2 }]
          });
          nodes.push(bufNode);
          pushConn({
            id: `c-decay-${dishIndex}-${pIdx}-${tIdx}-${dStep}`,
            fromNodeId: prevNode.id,
            fromPortId: prevPortId,
            toNodeId: bufNode.id,
            toPortId: `in-${currentItem}`,
            itemOrFluidName: currentItem,
            type: 'solid',
            actualFlowRate: 0.2
          });
          prevNode = bufNode;
          prevPortId = `out-${nextItem}`;
          currentItem = nextItem;
        });

        const targetInPort = toNode.inputs.find(inp => inp.name === currentItem);
        if (targetInPort) {
          pushConn({
            id: `c-decay-final-${dishIndex}-${pIdx}-${tIdx}`,
            fromNodeId: prevNode.id,
            fromPortId: prevPortId,
            toNodeId: toNode.id,
            toPortId: targetInPort.id,
            itemOrFluidName: currentItem,
            type: 'solid',
            actualFlowRate: targetInPort.rateRequired || 0.2
          });
          portUsedCapacity.set(portKey, used + reqRate);
        }
      }
    });
  });

  // 4. Fallback Auto-Healing: Dedicated 1:1 supplier for remaining inputs
  let healCounter = 0;
  nodes.forEach((consumer) => {
    consumer.inputs.forEach((inPort) => {
      // 忽略空端口或無物料端口
      if (!inPort.name || inPort.name === '無' || inPort.name === '待分流物料') return;

      if (inPort.type === 'fluid') {
        if (!ENV_FLUIDS.includes(inPort.name)) {
          if (!isInputConnected(consumer.id, inPort.id)) {
            const interDef = intermediateRecipes.find(r => r.name === inPort.name);
            // 只有當配方明確為攪拌機（且不是原位轉化液體如炙烈紅油）時才建立攪拌機
            if (interDef && interDef.machine === '攪拌機') {
              healCounter++;
              const mixerId = `heal-mixer-${dishIndex}-${healCounter}`;
              const mixerCycleTime = interDef.cycleTime || 5;
              const mixerNode = makeNode({
                id: mixerId,
                type: 'machine',
                title: `${interDef.name} (攪拌機)`,
                machineName: '攪拌機',
                recipeName: interDef.name,
                x: consumer.x - 320,
                y: consumer.y + 140,
                baseCycleTime: mixerCycleTime,
                baseOutputCount: interDef.outputCount || 1,
                basePowerConsumption: 1.0,
                baseGoblins: 1,
                inputs: (interDef.inputs || []).filter(inp => inp.name && inp.name !== '無').map(inp => ({
                  id: `in-${inp.name}`,
                  name: inp.name === '任意物品' ? baseCropItemName : inp.name,
                  type: 'solid' as const,
                  rateRequired: Number(((inp.count || 1) / mixerCycleTime).toFixed(3))
                })),
                outputs: [{
                  id: `out-${interDef.name}`,
                  name: interDef.name,
                  type: 'fluid',
                  rateProvided: 1.0
                }]
              });
              nodes.push(mixerNode);
              pushConn({
                id: `c-heal-mix-${dishIndex}-${healCounter}`,
                fromNodeId: mixerId,
                fromPortId: `out-${interDef.name}`,
                toNodeId: consumer.id,
                toPortId: inPort.id,
                itemOrFluidName: interDef.name,
                type: 'fluid',
                actualFlowRate: inPort.rateRequired || 1.0
              });
            }
          }
        }
        return;
      }

      if (!isInputConnected(consumer.id, inPort.id)) {
        healCounter++;
        const targetRawName = inPort.name === '重構底料' || inPort.name === '任意物品' ? baseCropItemName : inPort.name;
        const { isRecon, machName } = classifyRawSource(targetRawName);
        const machOutCount = targetRawName === '泥沼蟑螂' ? 2 : 1;
        const machCycle = 5;
        const machRate = Number((machOutCount / machCycle).toFixed(3));
        const healNodeId = `heal-mach-${dishIndex}-${healCounter}`;

        const isCondensation = items.find(i => i.name === targetRawName)?.island === '常規物資';
        const titlePrefix = isRecon 
          ? (isCondensation ? '空載凝結' : '重構') 
          : (machName === '採掘機' ? '開採' : '採收');

        const healNode = makeNode({
          id: healNodeId,
          type: 'machine',
          title: `${titlePrefix}：${targetRawName}`,
          machineName: machName,
          recipeName: targetRawName,
          x: consumer.x - 300,
          y: consumer.y + 120 + (healCounter % 3) * 60,
          baseCycleTime: machCycle,
          baseOutputCount: machOutCount,
          basePowerConsumption: isRecon ? 2.0 : 1.0,
          baseGoblins: isRecon ? 2 : 1,
          inputs: isRecon ? reconInputs() : [],
          outputs: [{
            id: `out-${targetRawName}`,
            name: targetRawName,
            type: 'solid',
            rateProvided: machRate
          }]
        });

        if (isRecon) {
          neededEnvFluids.add('虛空');
        }

        nodes.push(healNode);
        pushConn({
          id: `c-heal-${dishIndex}-${healCounter}`,
          fromNodeId: healNode.id,
          fromPortId: `out-${targetRawName}`,
          toNodeId: consumer.id,
          toPortId: inPort.id,
          itemOrFluidName: targetRawName,
          type: 'solid',
          actualFlowRate: inPort.rateRequired || 0.2
        });
      }
    });
  });

  // Second pass: heal mixer inputs if needed
  nodes.forEach((consumer) => {
    if (!consumer.id.startsWith('heal-mixer')) return;
    consumer.inputs.forEach((inPort) => {
      if (inPort.type === 'fluid') return;
      if (!inPort.name || inPort.name === '無') return;
      if (!isInputConnected(consumer.id, inPort.id)) {
        healCounter++;
        const targetRawName = inPort.name === '重構底料' || inPort.name === '任意物品' ? baseCropItemName : inPort.name;
        const { isRecon, machName } = classifyRawSource(targetRawName);
        const healNodeId = `heal-sub-${dishIndex}-${healCounter}`;

        const isCondensation = items.find(i => i.name === targetRawName)?.island === '常規物資';
        const titlePrefix = isRecon 
          ? (isCondensation ? '空載凝結' : '重構') 
          : (machName === '採掘機' ? '開採' : '採收');

        nodes.push(makeNode({
          id: healNodeId,
          type: 'machine',
          title: `${titlePrefix}：${targetRawName}`,
          machineName: machName,
          recipeName: targetRawName,
          x: consumer.x - 280,
          y: consumer.y + 60,
          baseCycleTime: 5,
          baseOutputCount: 1,
          basePowerConsumption: isRecon ? 2.0 : 1.0,
          baseGoblins: isRecon ? 2 : 1,
          inputs: isRecon ? reconInputs() : [],
          outputs: [{ id: `out-${targetRawName}`, name: targetRawName, type: 'solid', rateProvided: 0.2 }]
        }));
        pushConn({
          id: `c-sub-${dishIndex}-${healCounter}`,
          fromNodeId: healNodeId,
          fromPortId: `out-${targetRawName}`,
          toNodeId: consumer.id,
          toPortId: inPort.id,
          itemOrFluidName: targetRawName,
          type: 'solid',
          actualFlowRate: inPort.rateRequired || 0.2
        });
      }
    });
  });

  // Dedicated base donor (收割機 - 供底料) for any manipulator lacking base material
  nodes.filter(n => n.machineName === '物質操縱機').forEach(m => {
    const inBasePort = m.inputs.find(inp => inp.name === '重構底料' || inp.name === '任意物品' || inp.name === baseCropItemName || inp.id === 'in-base');
    if (inBasePort && !isInputConnected(m.id, inBasePort.id)) {
      healCounter++;
      const baseHarvesterId = `heal-base-${dishIndex}-${healCounter}`;
      nodes.push(makeNode({
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
      }));
      pushConn({
        id: `c-heal-base-${dishIndex}-${healCounter}`,
        fromNodeId: baseHarvesterId,
        fromPortId: `out-${baseCropItemName}`,
        toNodeId: m.id,
        toPortId: inBasePort.id,
        itemOrFluidName: baseCropItemName,
        type: 'solid',
        actualFlowRate: inBasePort.rateRequired || 0.2
      });
    }
  });

  // 5. Environment Fluids & Pumps
  const envMod = buildEnvFluidsModule(
    dishIndex,
    neededEnvFluids,
    nodes,
    '虛空汙泥',
    '虛空',
    '泵機',
    '物質操縱機'
  );
  nodes.push(...envMod.nodes);
  pushConn(...envMod.connections);

  // 6. Scorching Dish Auto-Remedy: Append remedy production line if scorching
  if (isScorchingDish(dish.name, items, recipes)) {
    if (remedyRecipe) {
      // Find maximum X and Y across current nodes to place remedy neatly on the right
      const maxX = Math.max(...nodes.map(n => n.x), 600);
      const offsetX = maxX + 400;

      // Build remedy blueprint without recursing into scorching check (since remedy is not scorching)
      const wBp = buildDishBlueprint(remedyRecipe, dishIndex * 100 + 88, context);
      
      // Shift remedy nodes to the right side
      wBp.nodes.forEach(wn => {
        nodes.push({
          ...wn,
          x: wn.x + offsetX
        });
      });

      wBp.connections.forEach(wc => {
        connections.push(wc);
      });
    }
  }

  // 7. Physics Simulation Verification
  const sim = simulateSandboxPhysics(nodes, connections);

  const isScorching = isScorchingDish(dish.name, items, recipes);
  const hotNote = isScorching ? `，並附帶【${remedyDishName}】自動中和解毒配產模組` : '';

  const blueprint: SandboxBlueprint = {
    id: `bp_dish_${dishIndex + 1}_${dish.name.replace(/\s+/g, '_')}`,
    name: `${dish.name} (標準產能 12份/分)`,
    description: `【${dish.island || '未知島嶼'}】${dish.name} 完整自動化產線：包含原料採集、中間加工、專屬流體輸送與獨立發電閉環${hotNote}。`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pan: { x: 50, y: 50 },
    zoom: 0.85,
    stats: {
      machineCount: nodes.filter(n => n.type === 'machine' || n.type === 'generator' || n.type === 'pump').length,
      powerLoad: Number(sim.metrics.totalPowerLoad.toFixed(2)),
      mainDishes: isScorching ? [dish.name, remedyDishName] : [dish.name]
    },
    nodes: sim.updatedNodes,
    connections: sim.updatedConnections
  };

  return blueprint;
}
