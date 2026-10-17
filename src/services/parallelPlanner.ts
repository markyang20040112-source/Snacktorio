import { Recipe, ProcessNode, FeederStrategy, DownstreamTarget, IntermediateRecipe, CalculationResult, Item, ConsolidatedProcessRecord } from '../types';
import { calculateSingleDish, settlePlantInfrastructure, isScorchingDish, getProcessRealSurplusRate, sortProcessesDownstreamToUpstream, computeIntegerRatio } from './solver';
import { matchParallelByproductFeeders, isBaseConsumerProcess } from './byproductMatching';
import { dataService } from './dataService';
import { formatFractionOrDecimal, gcdArray } from '../utils/math';

/**
 * 產線平衡計算機（單道速查 / 多料理並聯）純運算層。
 * 自 ParallelPlanner.tsx 抽離，元件只負責狀態與呈現；本檔無任何 React 依賴，可直接單元測試。
 */

export interface PlannedDish {
  id: string;
  dishName: string;
  rateMin: number; // dishes/min (e.g. 12 份/分 = 0.2 份/秒)
  isAutoAdded?: boolean;
}

type PowerMode = 'regular' | 'overclock';
type DishResult = PlannedDish & { calc: CalculationResult | null };

function consolidatePlan(
  individualResults: DishResult[],
  effectivePlannedList: PlannedDish[],
  powerMode: PowerMode,
  feederStrategy: FeederStrategy,
  intermediateRecipes: IntermediateRecipe[],
  items: Item[] = dataService.getItems()
) {
  const processMap = new Map<string, ConsolidatedProcessRecord>();

  individualResults.forEach(item => {
    if (!item.calc) return;

    // 1. Regular process nodes
    item.calc.processes.forEach((p: ProcessNode) => {
      if (!processMap.has(p.processName)) {
        processMap.set(p.processName, {
          processName: p.processName,
          machine: p.machine,
          baseRate: p.baseRate || 0.2,
          baseRateDisplay: p.baseRateDisplay || (p.baseRate ? formatFractionOrDecimal(p.baseRate) : '0.20/s'),
          integerRatio: p.integerRatio || 1,
          dishDemands: [],
          totalDemandRate: 0,
          independentSum: 0,
          parallelRounded: 0,
          savedCount: 0,
          powerPerUnit: p.countRounded > 0 ? p.power / p.countRounded : 0,
          goblinsPerUnit: p.countRounded > 0 ? p.goblins / p.countRounded : 0,
          topologies: [],
          downstreamTargets: [],
          feederRoles: []
        });
      }
      const record = processMap.get(p.processName)!;
      record.dishDemands.push({
        dishName: item.dishName,
        demand: p.demandRate,
        countRounded: p.countRounded,
        feederRole: p.feederRole,
        feederNote: p.feederNote
      });
      record.totalDemandRate += p.demandRate;
      record.independentSum += p.countRounded;

      if (p.topology) {
        record.topologies.push({ dishName: item.dishName, text: p.topology });
      }
      if (p.downstreamTargets && p.downstreamTargets.length > 0) {
        record.downstreamTargets.push({
          dishName: item.dishName,
          targets: p.downstreamTargets
        });
      }
      if (p.feederRole && p.feederNote) {
        record.feederRoles.push({
          dishName: item.dishName,
          role: p.feederRole,
          note: p.feederNote
        });
      }
    });
  });

  // 2. Base Feeder Harvester for matter manipulators & base consumers
  const dishesWithManipulators = individualResults.filter(
    item => item.calc && (item.calc.baseFeeders.grossRequired > 0 || item.calc.baseFeeders.count > 0)
  );

  if (dishesWithManipulators.length > 0) {
    const allConsumers = Array.from(new Set(
      dishesWithManipulators.flatMap(d => d.calc?.baseFeeders.consumerMachines || [d.calc?.baseFeeders.consumerMachine || '物質操縱機'])
    ));
    const primaryConsumer = allConsumers.length === 1 ? allConsumers[0] : (allConsumers.length > 1 ? allConsumers.join('、') : '物質操縱機');

    const feederKey = '底料作物採集 (收割機 底料專供)';

    // Identify merged base consumer processes in the factory
    const baseConsumerProcesses = Array.from(processMap.values()).filter(p => isBaseConsumerProcess(p, intermediateRecipes));

    // True merged gross requirement across the whole factory
    const mergedGrossBaseFeeders = baseConsumerProcesses.length > 0
      ? baseConsumerProcesses.reduce((sum, p) => sum + Math.ceil(p.totalDemandRate), 0)
      : dishesWithManipulators.reduce((sum, d) => sum + d.calc!.baseFeeders.grossRequired, 0);

    const independentGrossSum = dishesWithManipulators.reduce((sum, d) => sum + d.calc!.baseFeeders.grossRequired, 0);

    const feederRecord: ConsolidatedProcessRecord = {
      processName: feederKey,
      machine: '收割機 (底料專供)',
      baseRate: 0.2,
      baseRateDisplay: '0.20/s',
      integerRatio: 1,
      dishDemands: [],
      totalDemandRate: mergedGrossBaseFeeders,
      independentSum: independentGrossSum,
      parallelRounded: mergedGrossBaseFeeders,
      savedCount: Math.max(0, independentGrossSum - mergedGrossBaseFeeders),
      powerPerUnit: 1.0,
      goblinsPerUnit: 1.0,
      topologies: [{ dishName: '全廠', text: `1:1 防堵專線直供${primaryConsumer}` }],
      downstreamTargets: [],
      feederRoles: [],
      isBaseFeeder: true,
      baseFeederSummary: {
        grossRequired: mergedGrossBaseFeeders,
        offsetCount: 0,
        finalCount: mergedGrossBaseFeeders,
        offsetDetails: [],
        consumerMachine: primaryConsumer
      }
    };

    dishesWithManipulators.forEach(item => {
      const bf = item.calc!.baseFeeders;
      feederRecord.dishDemands.push({
        dishName: item.dishName,
        demand: bf.count,
        countRounded: bf.count,
        isOffset: bf.offsetCount > 0,
        offsetCount: bf.offsetCount,
        offsetSource: bf.offsetSource
      });
    });

    processMap.set(feederKey, feederRecord);
  }

  const list = Array.from(processMap.values()).map(record => {
    // 注入機環境設施並聯整併法則：全廠共用同一片轉化池，並聯時整併為 1 台環境轉化機，節省其餘重複台數
    const parallelRounded = record.machine === '注入機' ? 1 : Math.ceil(record.totalDemandRate);
    const savedCount = record.independentSum - parallelRounded;
    return {
      ...record,
      parallelRounded,
      savedCount
    };
  });

  // Re-normalize cross-dish downstream distribution ratios for multi-dish shared processes
  if (effectivePlannedList.length > 1) {
    list.forEach(record => {
      if (record.isBaseFeeder || record.machine === '自動廚師機' || !record.downstreamTargets || record.downstreamTargets.length <= 1) return;

      // Flatten all regular (non-byproduct) targets across all dishes
      const regularTargets: DownstreamTarget[] = [];
      record.downstreamTargets.forEach(dt => {
        dt.targets.forEach(t => {
          if (!t.isByproduct) regularTargets.push(t);
        });
      });

      if (regularTargets.length > 1) {
        const flowRates = regularTargets.map(t => t.flowRate !== undefined ? t.flowRate : t.ratio);
        if (regularTargets.some(t => t.flowRate !== undefined)) {
          const intRatios = computeIntegerRatio(flowRates);
          regularTargets.forEach((t, idx) => {
            t.ratio = intRatios[idx];
          });
        }
      }
    });
  }

  // 3. Physical Surplus Flow Offsetting in Parallel (when feederStrategy === 'recycle')
  if (feederStrategy === 'recycle') {
    const feederRow = list.find(r => r.isBaseFeeder);
    if (feederRow && feederRow.baseFeederSummary && feederRow.parallelRounded > 0) {
      const bfSummary = feederRow.baseFeederSummary;

      // If single dish mode, inherit the detailed offset from single dish solver directly
      if (effectivePlannedList.length === 1 && individualResults[0]?.calc?.baseFeeders) {
        const singleBf = individualResults[0].calc.baseFeeders;
        bfSummary.offsetCount = singleBf.offsetCount;
        feederRow.parallelRounded = singleBf.count;
        feederRow.totalDemandRate = singleBf.count;
        bfSummary.finalCount = singleBf.count;
        if (singleBf.offsetSource) {
          bfSummary.offsetDetails = [singleBf.offsetSource];
        }
      } else {
        matchParallelByproductFeeders(
          list,
          feederRow,
          intermediateRecipes,
          items,
          getProcessRealSurplusRate
        );
      }
    }
  }

  const totalIndependent = list.reduce((acc, r) => acc + r.independentSum, 0);
  const totalParallel = list.reduce((acc, r) => acc + r.parallelRounded, 0);
  const totalSavedMachines = totalIndependent - totalParallel;
  const totalMainPower = list.reduce((acc, r) => acc + r.parallelRounded * r.powerPerUnit, 0);
  const totalMainGoblins = list.reduce((acc, r) => acc + r.parallelRounded * r.goblinsPerUnit, 0);

  const isSingleDish = effectivePlannedList.length === 1;
  if (isSingleDish) {
    const counts = list.map(r => r.parallelRounded);
    const g = gcdArray(counts);
    list.forEach(r => {
      r.integerRatio = g > 0 ? r.parallelRounded / g : r.parallelRounded;
    });
  }

  // Consolidated Plant-Wide Fluids System
  let totalWaterDemand = 0;
  let totalOilDemand = 0;
  let totalProcessVoid = 0;
  const allTransformations: { name: string; fluid: string; demand: number }[] = [];
  const allSauces: { name: string; rate: number; dedicatedPipes: number; dishName: string }[] = [];

  individualResults.forEach(item => {
    if (!item.calc) return;
    totalWaterDemand += item.calc.fluids.water.demand;
    totalOilDemand += item.calc.fluids.oil.demand;
    totalProcessVoid += item.calc.fluids.voidFluid.breakdown.processVoid;
    item.calc.fluids.transformations.forEach(t => {
      const existing = allTransformations.find(x => x.fluid === t.fluid);
      if (existing) {
        existing.demand = Number((existing.demand + t.demand).toFixed(2));
      } else {
        allTransformations.push({
          name: t.name,
          fluid: t.fluid,
          demand: t.demand
        });
      }
    });
    item.calc.fluids.sauces.forEach(s => {
      allSauces.push({
        name: s.name,
        rate: s.rate,
        dedicatedPipes: s.dedicatedPipes,
        dishName: item.dishName
      });
    });
  });

  totalWaterDemand = Number(totalWaterDemand.toFixed(2));
  totalOilDemand = Number(totalOilDemand.toFixed(2));
  totalProcessVoid = Number(totalProcessVoid.toFixed(2));

  // 全廠基建結算（與單料理求解共用 settlePlantInfrastructure；totalMainPower 已含底料收割機）
  const infra = settlePlantInfrastructure({
    powerMode,
    waterDemand: totalWaterDemand,
    oilDemand: totalOilDemand,
    processVoid: totalProcessVoid,
    transformations: allTransformations,
    mainPower: totalMainPower
  });

  const baseFeederRow = list.find(r => r.isBaseFeeder);
  const totalBaseFeederPower = baseFeederRow ? baseFeederRow.parallelRounded * 1.0 : 0;
  const totalPureMainPower = list.filter(r => !r.isBaseFeeder).reduce((acc, r) => acc + r.parallelRounded * r.powerPerUnit, 0);

  return {
    processes: sortProcessesDownstreamToUpstream(list),
    isSingleDish,
    totalIndependent,
    totalParallel,
    totalSavedMachines,
    totalMainPower,
    totalPureMainPower,
    totalBaseFeederPower,
    baseFeederSummary: baseFeederRow?.baseFeederSummary,
    totalMainGoblins,
    plantWater: infra.water,
    plantOil: infra.oil,
    plantVoid: infra.voidInfo,
    sizedTransformations: infra.transformations,
    allSauces,
    hasVoidFacility: infra.hasVoidFacility,
    totalPlantRegularPumps: infra.totalRegularPumps,
    totalPlantOverclockPumps: infra.totalOverclockPumps,
    totalPlantSludgeManipulators: infra.totalSludgeManipulators,
    totalPlantPumpPower: infra.totalPumpManipulatorPower,
    furnaces: infra.furnaces,
    coalMiners: infra.coalMiners,
    genSludgeManipulators: infra.genSludgeManipulators,
    coalRate: infra.coalRate,
    grossPower: infra.grossPower,
    netPower: infra.netPower,
    surplusPower: infra.surplusPower,
    totalPlantPowerLoad: infra.totalLoad,
    totalPlantGoblins: totalMainGoblins + infra.furnaces * 1 + infra.coalMiners * 1 + infra.totalPumpManipulatorPower
  };
}

export type ConsolidatedPlan = ReturnType<typeof consolidatePlan>;

/** 完整並聯規劃管線：熾熱配餐 → 單料理求解 → 生化警示彙整 → 跨料理去重合併與全廠基建結算。 */
export function runParallelPlan(
  plannedList: PlannedDish[],
  powerMode: PowerMode,
  feederStrategy: FeederStrategy,
  recipes: Recipe[]
) {
  const items = dataService.getItems();
  const intermediateRecipes = dataService.getIntermediateRecipes();

  // 1. Identify all scorching dishes from user's planned list
  const scorchingDishes = plannedList.filter(p => isScorchingDish(p.dishName, items, recipes));

  // 2. Sum target rates of all scorching dishes
  const totalScorchingRateMin = scorchingDishes.reduce((sum, p) => sum + (p.rateMin || 0), 0);

  // 3. Construct effective planned list (auto-pair 胃復慘)
  let effectivePlannedList: PlannedDish[] = plannedList;
  if (totalScorchingRateMin > 0) {
    const hasPepto = plannedList.some(p => p.dishName === '胃復慘');
    effectivePlannedList = hasPepto
      ? plannedList.map(p => (p.dishName === '胃復慘' ? { ...p, rateMin: Math.max(p.rateMin, totalScorchingRateMin) } : p))
      : [...plannedList, { id: '__auto_pepto__', dishName: '胃復慘', rateMin: totalScorchingRateMin, isAutoAdded: true }];
  }

  // 4. Individual calculation results (rate converted to dishes/s for solver)
  const individualResults: DishResult[] = effectivePlannedList.map(p => ({
    ...p,
    calc: calculateSingleDish(p.dishName, p.rateMin / 60, powerMode, feederStrategy)
  }));

  // 5. Combined biochemical warnings across all parallel dishes (deduplicated)
  const seen = new Set<string>();
  const combinedBiochemicalWarnings: { item: string; type: string; detail: string }[] = [];
  individualResults.forEach(r => {
    r.calc?.biochemicalWarnings?.forEach(w => {
      const key = `${w.item}-${w.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        combinedBiochemicalWarnings.push(w);
      }
    });
  });

  const consolidated = consolidatePlan(individualResults, effectivePlannedList, powerMode, feederStrategy, intermediateRecipes, items);

  return { scorchingDishes, totalScorchingRateMin, effectivePlannedList, individualResults, combinedBiochemicalWarnings, consolidated };
}
