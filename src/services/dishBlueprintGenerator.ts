import { 
  getProcessOutputItem,
  getProcessInputItems,
  isScorchingDish
} from './solver';
import { runParallelPlan } from './parallelPlanner';
import { dataService } from './dataService';
import { simulateSandboxPhysics } from '../components/Sandbox/sandboxPhysics';
import { makeNode, calculateFitView } from '../components/Sandbox/sandboxNodeUtils';
import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxBlueprint,
  PortDefinition 
} from '../components/Sandbox/sandboxTypes';
import { Recipe, IntermediateRecipe, Machine, Item } from '../types';
import { ENV_FLUIDS } from '../utils/itemTraits';
import { buildPowerModule, buildEnvFluidsModule } from './dishBlueprintPower';
import { applyHierarchicalLayout } from './dishBlueprintLayout';
import { routeSolidOutputs, SolidTargetSpec } from './dishBlueprintSplitter';

/**
 * 依據各上游機台額定容量進行最佳適配裝箱分流 (Best-Fit Decreasing)，消滅一對多盲目取餘數導致的過載欠壓
 */
function partitionTargetsToSuppliers<T extends { flowRate: number }>(
  fromNodes: { outputs: PortDefinition[] }[],
  targets: T[],
  defaultCap: number
): T[][] {
  const n = fromNodes.length;
  if (n <= 1) return [targets];
  if (targets.length <= 1) {
    const res: T[][] = Array.from({ length: n }, () => []);
    res[0] = targets;
    return res;
  }

  const bins: { capacity: number; load: number; items: T[] }[] = fromNodes.map(fn => {
    const cap = fn.outputs[0]?.rateProvided || defaultCap;
    return { capacity: cap > 0 ? cap : defaultCap, load: 0, items: [] };
  });

  const sorted = targets
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => (b.t.flowRate - a.t.flowRate) || (a.idx - b.idx));

  for (const { t } of sorted) {
    let bestBinIdx = -1;
    let minResidual = Infinity;

    for (let i = 0; i < n; i++) {
      if (bins[i].load + t.flowRate <= bins[i].capacity + 0.005) {
        const residual = bins[i].capacity - (bins[i].load + t.flowRate);
        if (residual < minResidual) {
          minResidual = residual;
          bestBinIdx = i;
        }
      }
    }

    if (bestBinIdx === -1) {
      let minLoad = Infinity;
      for (let i = 0; i < n; i++) {
        if (bins[i].load < minLoad) {
          minLoad = bins[i].load;
          bestBinIdx = i;
        }
      }
    }

    bins[bestBinIdx].items.push(t);
    bins[bestBinIdx].load += t.flowRate;
  }

  return bins.map(b => b.items);
}

/**
 * 為指定終端料理全自動推導並建置完整 100% 滿載且無虛假產能之最高效率沙盒產線藍圖
 * (純資料庫驅動、副產物折抵節省機台、可調比例分流器中轉、流體獨立專線、集中供液與統一電網平衡)
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

  const isScorching = isScorchingDish(dish.name, items, recipes);
  const remedyRecipe = recipes.find(r => r.notes?.includes('中和') && (r.notes?.includes('熾熱') || r.notes?.includes('炙熱')));
  const remedyDishName = remedyRecipe?.name || '';

  // 1. 產線計算機最高效率規劃 (超頻模式 + 副產物折抵模式 recycle + 熾熱自動配產中和料理)
  const plan = runParallelPlan(
    [{ id: 'main', dishName: dish.name, rateMin: 12 }],
    'overclock',
    'recycle',
    recipes
  );

  const procs = plan.consolidated.processes;
  const nodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];
  const neededEnvFluids = new Set<string>();

  const connectedInputs = new Set<string>();
  const inputKey = (nodeId: string, portId: string) => `${nodeId}\u0000${portId}`;
  const pushConn = (...conns: SandboxConnection[]) => {
    conns.forEach(c => {
      connections.push(c);
      connectedInputs.add(inputKey(c.toNodeId, c.toPortId));
    });
  };
  const isInputConnected = (nodeId: string, portId: string) => connectedInputs.has(inputKey(nodeId, portId));

  const allItemsSet = new Set<string>();
  items.forEach(i => allItemsSet.add(i.name));
  [...recipes, ...intermediateRecipes].forEach(r => {
    allItemsSet.add(r.name);
    (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
    if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
  });

  const baseCropItem = items.find(it => it.attributes?.includes('底料'))
    || items.find(it => it.source === '收割機' && it.name.includes('桂'))
    || items.find(it => it.source === '收割機' && it.island.includes('波莫拉'))
    || items.find(it => it.source === '收割機');
  const baseCropItemName = baseCropItem?.name || '';


  const SPOIL_MAP = new Map<string, { product: string; time: number }>();
  items.forEach(item => {
    if (item.isPerishable && item.spoilProduct) {
      SPOIL_MAP.set(item.name, { product: item.spoilProduct, time: Number(item.spoilTime) || 15 });
    }
  });

  const procNodesMap = new Map<string, SandboxNodeData[]>();
  const procOutputMap = new Map<string, { name: string; isFluid: boolean }>();
  const transPumpMap = new Map<string, SandboxNodeData>();
  const splitterCounter = { current: 0 };

  // 2. 實例化各工序之實體機台節點 (實裝精省機台數與足額產能保證)
  procs.forEach((p, pIdx) => {
    if (p.isBaseFeeder) {
      const feederCount = p.parallelRounded || 1;
      const feederList: SandboxNodeData[] = [];
      for (let fIdx = 0; fIdx < feederCount; fIdx++) {
        const nodeId = `base-feeder-${dishIndex}-${fIdx}`;
        const fNode = makeNode({
          id: nodeId,
          type: 'machine',
          title: `採收：${baseCropItemName} (底料專供 #${fIdx + 1})`,
          machineName: '收割機',
          recipeName: baseCropItemName,
          x: 200,
          y: 100 + fIdx * 240,
          baseCycleTime: 5,
          baseOutputCount: 1,
          basePowerConsumption: 1.0,
          baseGoblins: 1,
          inputs: [],
          outputs: [{ id: `out-${baseCropItemName}`, name: baseCropItemName, type: 'solid', rateProvided: 0.2 }]
        });
        nodes.push(fNode);
        feederList.push(fNode);
      }
      procNodesMap.set(p.processName, feederList);
      procOutputMap.set(p.processName, { name: baseCropItemName, isFluid: false });
      return;
    }

    if (p.machine === '自動廚師機') {
      const instanceList: SandboxNodeData[] = [];
      p.dishDemands.forEach((dem, dIdx) => {
        const isPepto = Boolean(isScorching && remedyDishName && dem.dishName === remedyDishName);
        const dObj = recipes.find(r => r.name === dem.dishName) || dish;
        const nodeId = isPepto ? `proc-pepto-chef-${dishIndex}` : `proc-main-chef-${dishIndex}`;

        const craftsPerSec = isPepto ? (12 / 60) / (dObj.outputCount || 1) : 0.2;
        const inputs: PortDefinition[] = [];
        (dObj.inputs || []).forEach(inp => {
          if (inp.name && inp.name !== '無' && inp.count > 0) {
            inputs.push({
              id: `in-${inp.name}`,
              name: inp.name,
              type: 'solid',
              rateRequired: Number((craftsPerSec * inp.count).toFixed(3))
            });
          }
        });
        if (dObj.fluidType && dObj.fluidType !== '無') {
          inputs.push({
            id: `in-fluid-${dObj.fluidType}`,
            name: dObj.fluidType,
            type: 'fluid',
            rateRequired: isPepto ? Number((craftsPerSec * (dObj.cycleTime || 5) * (dObj.fluidRate || 1.0)).toFixed(3)) : (dObj.fluidRate || 1.0)
          });
          if (ENV_FLUIDS.includes(dObj.fluidType)) {
            neededEnvFluids.add(dObj.fluidType);
          }
        }

        const chefNode = makeNode({
          id: nodeId,
          type: 'machine',
          title: `自動廚師機 (${dem.dishName})`,
          machineName: '自動廚師機',
          recipeName: dem.dishName,
          targetRatePerMin: 12,
          x: 1200,
          y: 100 + dIdx * 300,
          baseCycleTime: dObj.cycleTime || 5,
          baseOutputCount: dObj.outputCount || 1,
          basePowerConsumption: 1.0,
          baseGoblins: 3,
          inputs,
          outputs: [{
            id: `out-${dem.dishName}`,
            name: dem.dishName,
            type: 'solid',
            rateProvided: Number(((dObj.outputCount || 1) / (dObj.cycleTime || 5)).toFixed(3))
          }],
          isAutoPepto: isPepto
        });

        nodes.push(chefNode);
        instanceList.push(chefNode);
      });

      procNodesMap.set(p.processName, instanceList);
      procOutputMap.set(p.processName, { name: dish.name, isFluid: false });
      return;
    }

    const outputInfo = getProcessOutputItem(p as any, dish.name, intermediateRecipes, allItemsSet);
    procOutputMap.set(p.processName, outputInfo);

    const instancesCount = Math.max(1, p.parallelRounded || 1);
    const instanceList: SandboxNodeData[] = [];
    const interDef = intermediateRecipes.find(r => r.name === p.processName || r.name === outputInfo.name);
    const machCycleTime = interDef?.cycleTime || 5;

    const isExclusivelyPepto = Boolean(remedyDishName && p.dishDemands.length === 1 && p.dishDemands[0].dishName === remedyDishName);

    for (let instIdx = 0; instIdx < instancesCount; instIdx++) {
      const nodeId = `proc-${dishIndex}-${pIdx}-${instIdx}`;
      const inputInfos = getProcessInputItems(p as any, dish.name, procs as any, recipes, intermediateRecipes);
      const inputs: PortDefinition[] = [];

      inputInfos.forEach(inp => {
        if (p.machine === '注入機' && inp.isFluid) return;
        if (!inp.name || inp.name === '無') return;
        const solidReq = Number(((inp.count || 1) / machCycleTime).toFixed(3));
        inputs.push({
          id: inp.isFluid ? `in-fluid-${inp.name}` : `in-${inp.name}`,
          name: inp.name,
          type: inp.isFluid ? 'fluid' : 'solid',
          rateRequired: inp.isFluid ? (inp.count || (p.machine === '混合機' ? 0.5 : 1.0)) : solidReq
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
      const defaultMachRate = p.machine === '注入機' ? 999 : (isFluidMach ? 1.0 : Number((machOutputCount / machCycleTime).toFixed(3)));
      const machRate = defaultMachRate;

      const mObj = machines.find(m => m.name === p.machine);
      const machPower = mObj?.power || p.powerPerUnit || 1.0;
      const machGoblins = mObj?.goblins || p.goblinsPerUnit || 1;
      const subTitle = instancesCount > 1 ? ` #${instIdx + 1}` : '';

      const node = makeNode({
        id: nodeId,
        type: 'machine',
        title: `${p.processName}${subTitle} (${p.machine})`,
        machineName: p.machine,
        recipeName: outputInfo.name,
        x: 400 + pIdx * 100,
        y: 100 + instIdx * 250,
        baseCycleTime: machCycleTime,
        baseOutputCount: machOutputCount,
        basePowerConsumption: machPower,
        baseGoblins: machGoblins,
        inputs,
        outputs: [{
          id: `out-${outputInfo.name}`,
          name: outputInfo.name,
          type: isFluidMach ? 'fluid' : 'solid',
          rateProvided: machRate
        }],
        isAutoPepto: isExclusivelyPepto
      });

      nodes.push(node);
      instanceList.push(node);

      if (p.machine === '注入機') {
        const transFluidName = outputInfo.name;
        const pumpNodeId = `pump-trans-${dishIndex}-${pIdx}-${instIdx}`;
        const transPumpNode = makeNode({
          id: pumpNodeId,
          type: 'pump',
          title: `${transFluidName}抽取泵機`,
          machineName: '泵機',
          powerMode: 'regular',
          pumpCapacity: 2.0,
          x: node.x + 180,
          y: node.y,
          baseCycleTime: 1,
          baseOutputCount: 2.0,
          basePowerConsumption: 1.0,
          baseGoblins: 0,
          inputs: [{ id: 'in-fluid', name: transFluidName, type: 'fluid', rateRequired: 2.0 }],
          outputs: [{ id: `out-${transFluidName}`, name: transFluidName, type: 'fluid', rateProvided: 2.0 }],
          isAutoPepto: isExclusivelyPepto
        });
        nodes.push(transPumpNode);
        pushConn({
          id: `c-trans-inj-${dishIndex}-${pIdx}-${instIdx}`,
          fromNodeId: node.id,
          fromPortId: `out-${transFluidName}`,
          toNodeId: transPumpNode.id,
          toPortId: 'in-fluid',
          itemOrFluidName: transFluidName,
          type: 'fluid',
          actualFlowRate: 2.0
        });
        transPumpMap.set(node.id, transPumpNode);
      }
    }

    procNodesMap.set(p.processName, instanceList);
  });

  // 3. 下游物料精準路由與分流器配置 (完全由 downstreamTargets 驅動，含副產物折抵與流體均分)
  procs.forEach((p, pIdx) => {
    if (p.isBaseFeeder) return;
    const fromNodes = procNodesMap.get(p.processName)!;
    const outputInfo = procOutputMap.get(p.processName)!;
    if (!fromNodes || fromNodes.length === 0) return;

    const solidTargets: SolidTargetSpec[] = [];
    const fluidTargets: { toNode: SandboxNodeData; toPort: PortDefinition; flowRate: number }[] = [];

    // 常規下游目標匹配與副產物折抵 (直接由 downstreamTargets 驅動)
    const allocatedInputs = new Set<string>();
    (p.downstreamTargets || []).forEach(group => {
      (group.targets || []).forEach(dt => {
        if (dt.isByproduct) {
          const toNodes = procNodesMap.get(dt.processName) || [];
          for (const rn of toNodes) {
            const inBasePort = rn.inputs.find(inp => 
              (inp.id === 'in-base' || inp.name === '重構底料' || inp.name === '任意物品') &&
              !isInputConnected(rn.id, inp.id) &&
              !allocatedInputs.has(inputKey(rn.id, inp.id))
            );
            if (inBasePort) {
              allocatedInputs.add(inputKey(rn.id, inBasePort.id));
              solidTargets.push({
                toNode: rn,
                toPort: inBasePort,
                flowRate: dt.flowRate || 0.20,
                isByproduct: true
              });
              break;
            }
          }
          return;
        }

        let targetProcessName = dt.processName;
        let toNodes = procNodesMap.get(targetProcessName);

        if (!toNodes || toNodes.length === 0) {
          if (dt.machine === '自動廚師機' || dt.processName === dish.name || Boolean(remedyDishName && dt.processName === remedyDishName)) {
            const chefNodes = procNodesMap.get('終端組裝') || [];
            toNodes = chefNodes.filter(cn => cn.recipeName === group.dishName);
            if (toNodes.length === 0) toNodes = chefNodes;
          }
        }

        if (!toNodes || toNodes.length === 0) return;

        const availableNodes = toNodes.filter(node => 
          node.inputs.some(inp => 
            inp.name === outputInfo.name && 
            !isInputConnected(node.id, inp.id) &&
            !allocatedInputs.has(inputKey(node.id, inp.id))
          )
        );

        if (availableNodes.length === 0) return;

        // 檢查 group.targets 是否已經為每台實體下游設備拆分獨立 target 條目
        const sameProcEntries = (group.targets || []).filter(t => t.processName === dt.processName && !t.isByproduct);
        const isOnePerInstance = sameProcEntries.length > 1 || sameProcEntries.length === toNodes.length;
        const matchingNodes = isOnePerInstance ? [availableNodes[0]] : availableNodes;

        const nodeOutgoingLoads = matchingNodes.map(node => {
          const outConns = connections.filter(c => c.fromNodeId === node.id);
          return outConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
        });
        const totalOutgoingLoad = nodeOutgoingLoads.reduce((a, b) => a + b, 0);
        const hasDistinctLoads = totalOutgoingLoad > 0 && nodeOutgoingLoads.some(l => Math.abs(l - nodeOutgoingLoads[0]) > 0.001);

        matchingNodes.forEach((tn, mIdx) => {
          const pInp = tn.inputs.find(inp => 
            inp.name === outputInfo.name && 
            !isInputConnected(tn.id, inp.id) &&
            !allocatedInputs.has(inputKey(tn.id, inp.id))
          )!;
          allocatedInputs.add(inputKey(tn.id, pInp.id));

          let calculatedReq: number;
          if (dt.flowRate && hasDistinctLoads) {
            calculatedReq = dt.flowRate * (nodeOutgoingLoads[mIdx] / totalOutgoingLoad);
          } else {
            calculatedReq = dt.flowRate ? dt.flowRate / (matchingNodes.length || 1) : (pInp.rateRequired || 0.2);
          }
          const reqRate = Number(calculatedReq.toFixed(3));

          if (pInp.type === 'fluid') {
            fluidTargets.push({ toNode: tn, toPort: pInp, flowRate: reqRate });
          } else {
            solidTargets.push({ toNode: tn, toPort: pInp, flowRate: reqRate });
          }
        });
      });
    });

    // 多階時序發酵尋徑 (支援 1 階、2 階、3 階...熟成產物完整拓撲，消除 break 截斷)
    nodes.forEach(tn => {
      let current = outputInfo.name;
      const path: string[] = [];
      while (SPOIL_MAP.has(current)) {
        const next = SPOIL_MAP.get(current)!.product;
        path.push(next);
        const decayInp = tn.inputs.find(inp => inp.name === next && !isInputConnected(tn.id, inp.id) && !allocatedInputs.has(inputKey(tn.id, inp.id)));
        if (decayInp) {
          allocatedInputs.add(inputKey(tn.id, decayInp.id));
          const reqRate = Number((decayInp.rateRequired || 0.2).toFixed(3));
          solidTargets.push({
            toNode: tn,
            toPort: decayInp,
            flowRate: reqRate,
            decayPath: [...path]
          });
        }
        current = next;
      }
    });

    // 連續流體 1:1 專線直供與等額均分 (支援 1 台攪拌機 1:1 均供 2 個 0.5 fl/s 目標)
    if (outputInfo.isFluid || p.machine === '注入機') {
      const partitionedFluid = partitionTargetsToSuppliers(fromNodes, fluidTargets, 1.0);
      fromNodes.forEach((rawFn, fIdx) => {
        const fn = (rawFn.machineName === '注入機' && transPumpMap.get(rawFn.id))
          ? transPumpMap.get(rawFn.id)!
          : rawFn;
        const outPort = fn.outputs[0];
        if (!outPort) return;

        const assignedFluid = partitionedFluid[fIdx] || [];

        assignedFluid.forEach((ft, aIdx) => {
          pushConn({
            id: `c-fl-${dishIndex}-${pIdx}-${fIdx}-${aIdx}`,
            fromNodeId: fn.id,
            fromPortId: outPort.id,
            toNodeId: ft.toNode.id,
            toPortId: ft.toPort.id,
            itemOrFluidName: outputInfo.name,
            type: 'fluid',
            actualFlowRate: ft.flowRate
          });
        });
      });
      return;
    }

    // 固體路由分流 (呼叫 routeSolidOutputs：均等直連、比例分流器、副產物直供)
    const partitionedSolid = partitionTargetsToSuppliers(fromNodes, solidTargets, 0.2);
    fromNodes.forEach((fn, fIdx) => {
      const outPort = fn.outputs[0];
      if (!outPort) return;

      const assignedTargets = partitionedSolid[fIdx] || [];
      if (assignedTargets.length === 0) return;

      const res = routeSolidOutputs(
        dishIndex,
        pIdx,
        fIdx,
        fn,
        outPort,
        outputInfo.name,
        assignedTargets,
        splitterCounter,
        SPOIL_MAP
      );

      nodes.push(...res.extraNodes);
      pushConn(...res.connections);
    });
  });

  // 4. 重構機底料滿載直供 (1:1 對接計算機底料收割機，每台嚴格滿載 0.20/s)
  const feederNodes = procNodesMap.get('底料作物採集 (收割機 底料專供)') || [];
  const unconReconNodes = nodes.filter(n => 
    (n.machineName === '物質操縱機' || n.machineName === '烤箱') && 
    n.inputs.some(inp => (inp.id === 'in-base' || inp.name === '重構底料' || inp.name === '任意物品') && !isInputConnected(n.id, inp.id))
  );

  unconReconNodes.forEach((targetRecon, rIdx) => {
    const inPort = targetRecon.inputs.find(inp => inp.id === 'in-base' || inp.name === '重構底料' || inp.name === '任意物品');
    if (!inPort) return;

    const fNode = feederNodes[rIdx];
    if (fNode) {
      pushConn({
        id: `c-base-feeder-${dishIndex}-${rIdx}`,
        fromNodeId: fNode.id,
        fromPortId: fNode.outputs[0].id,
        toNodeId: targetRecon.id,
        toPortId: inPort.id,
        itemOrFluidName: baseCropItemName,
        type: 'solid',
        actualFlowRate: 0.20
      });
    }
  });

  // 5. 左側集中供液系統 (水 / 油 / 虛空統籌抽取與超頻自耗閉環)
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

  // 6. 下方統一集中電網平衡 (2:1 虛空熔爐與採煤機，淨盈餘 >= 0 FV/s)
  const currentTotalLoad = nodes
    .filter(n => n.type !== 'generator' && !n.id.startsWith('pwr-coal') && n.type !== 'splitter')
    .reduce((sum, n) => sum + (n.basePowerConsumption || 0), 0);

  let totalFurnaceCount = Math.max(1, Math.ceil(currentTotalLoad / 3.5));
  let totalCoalMinerCount = Math.ceil(totalFurnaceCount / 2);
  while (totalFurnaceCount * 4 < currentTotalLoad + totalCoalMinerCount) {
    totalFurnaceCount++;
    totalCoalMinerCount = Math.ceil(totalFurnaceCount / 2);
  }
  const powerMod = buildPowerModule(dishIndex, totalFurnaceCount, totalCoalMinerCount, '煤炭', '虛空熔爐', '採掘機');
  nodes.push(...powerMod.nodes);
  pushConn(...powerMod.connections);

  // 7. 三大區塊階層與端口通道佈局排版
  applyHierarchicalLayout(nodes, connections);

  // 8. 沙盒物理結算檢驗
  const sim = simulateSandboxPhysics(nodes, connections);

  const hotNote = isScorching ? `，並附帶【${remedyDishName}】自動中和解毒配產模組` : '';
  const initialView = calculateFitView(sim.updatedNodes, 1400, 800, 60);

  const blueprint: SandboxBlueprint = {
    id: `bp_dish_${dishIndex + 1}_${dish.name.replace(/\s+/g, '_')}`,
    name: `${dish.name} (最高效率 12份/分)`,
    description: `【${dish.island || '未知島嶼'}】${dish.name} 完整自動化產線：依產線計算機最高效率接法，支援副產物折抵、比例分流器中轉與統一電網閉環${hotNote}。`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pan: initialView.pan,
    zoom: initialView.zoom,
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
