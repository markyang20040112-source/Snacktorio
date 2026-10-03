import { Recipe, ProcessNode, FeederStrategy, DownstreamTarget, IntermediateRecipe, CalculationResult } from '../types';
import { calculateSingleDish, sizeAutonomousPump, isScorchingDish, getProcessRealSurplusRate, sortProcessesDownstreamToUpstream, computeIntegerRatio } from './solver';
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
  intermediateRecipes: IntermediateRecipe[]
) {
  interface ProcessDemandItem {
    dishName: string;
    demand: number;
    countRounded: number;
    feederRole?: 'donor' | 'recipient';
    feederNote?: string;
    isOffset?: boolean;
    offsetCount?: number;
    offsetSource?: string;
  }

  interface ConsolidatedProcessRecord {
    processName: string;
    machine: string;
    baseRate: number;
    baseRateDisplay?: string;
    integerRatio?: number;
    dishDemands: ProcessDemandItem[];
    totalDemandRate: number;
    independentSum: number;
    parallelRounded: number;
    savedCount: number;
    powerPerUnit: number;
    goblinsPerUnit: number;
    topologies: { dishName: string; text: string }[];
    downstreamTargets: { dishName: string; targets: DownstreamTarget[] }[];
    feederRoles: { dishName: string; role: 'donor' | 'recipient'; note: string }[];
    isBaseFeeder?: boolean;
    baseFeederSummary?: {
      grossRequired: number;
      offsetCount: number;
      finalCount: number;
      offsetDetails: string[];
      consumerMachine?: string;
    };
    tier?: number;
  }

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
    const baseConsumerProcesses = Array.from(processMap.values()).filter(p => {
      if (p.machine === '物質操縱機') return true;
      const matchingInter = intermediateRecipes.find(r => r.name === p.processName || p.processName.includes(r.name));
      if (matchingInter && matchingInter.inputs?.some(inp => ['任意物品', '重構底料', '底料'].includes(inp.name))) return true;
      return false;
    });

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
      const consumerName = bfSummary.consumerMachine || '物質操縱機';
      const nonDonorMachines = ['自動廚師機', consumerName, '物質操縱機', '攪拌機', '注入機', '虛空熔爐', '虛空泵機'];

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
        // Multi-dish parallel: clean previous feeder roles, dish demands, and byproduct downstream targets
        // to recalculate strictly on merged physical flow
        list.forEach(proc => {
          proc.feederRoles = [];
          if (proc.downstreamTargets) {
            proc.downstreamTargets.forEach(dt => {
              dt.targets = dt.targets.filter(t => !t.isByproduct);
            });
            proc.downstreamTargets = proc.downstreamTargets.filter(dt => dt.targets.length > 0);
          }
          if (proc.dishDemands) {
            proc.dishDemands.forEach(dd => {
              dd.feederRole = undefined;
              dd.feederNote = undefined;
            });
          }
        });

        // Deadlock / Progenitor protection
        const baseConsumerProcs = list.filter(p => {
          if (p.machine === '物質操縱機') return true;
          const matchingInter = intermediateRecipes.find(r => r.name === p.processName || p.processName.includes(r.name));
          if (matchingInter && matchingInter.inputs?.some(inp => ['任意物品', '重構底料', '底料'].includes(inp.name))) return true;
          return false;
        });

        const progenitorProcs = baseConsumerProcs.filter(m => {
          const mProduct = m.processName.replace('重構', '').replace('物質操縱', '').trim();
          return list.some(c => {
            if (nonDonorMachines.includes(c.machine)) return false;
            const rec = intermediateRecipes.find(r => r.name === c.processName || c.processName.includes(r.name) || r.name.includes(c.processName));
            return rec ? rec.inputs.some(inp => inp.name.includes(mProduct) || mProduct.includes(inp.name)) : false;
          });
        });

        const rootConsumer = progenitorProcs[0] || baseConsumerProcs[0];
        const maxOffsetAllowed = progenitorProcs.length > 0 ? Math.max(0, feederRow.parallelRounded - 1) : feederRow.parallelRounded;

        let totalOffsetsAllocated = 0;
        const eligibleRecipients = progenitorProcs.length > 0
          ? baseConsumerProcs.filter(m => m !== rootConsumer)
          : baseConsumerProcs;

        // Iterate over candidate donor processes
        list.forEach(proc => {
          if (proc.isBaseFeeder || nonDonorMachines.includes(proc.machine)) return;
          if (totalOffsetsAllocated >= maxOffsetAllowed) return;

          const surplusFlow = getProcessRealSurplusRate(proc, list, intermediateRecipes); // 考慮上游供料限流約束之真實物理淨產出流率 (items/second)

          if (surplusFlow >= 0.199) {
            let availableSlots = Math.floor((surplusFlow + 0.001) / 0.20);
            const assignedRecipients: ProcessNode[] = [];

            while (availableSlots > 0 && totalOffsetsAllocated < maxOffsetAllowed && eligibleRecipients.length > 0) {
              const unassignedRecipient = eligibleRecipients.find(rec => !rec.feederRoles.some(fr => fr.role === 'recipient'));
              if (!unassignedRecipient) break;

              availableSlots--;
              totalOffsetsAllocated++;
              assignedRecipients.push(unassignedRecipient as any);

              unassignedRecipient.feederRoles.push({
                dishName: '全廠',
                role: 'recipient',
                note: `底料由【${proc.processName}】過剩產能直供 (省 1 底料機)`
              });
            }

            if (assignedRecipients.length > 0) {
              const recNames = assignedRecipients.map(r => `【${r.processName}】`).join('、');
              proc.feederRoles.push({
                dishName: '全廠',
                role: 'donor',
                note: `產能過剩，分流直供${recNames}作為底料 (${surplusFlow.toFixed(2)}/s)`
              });

              // Add byproduct target to downstreamTargets if not already present
              if (!proc.downstreamTargets) proc.downstreamTargets = [];
              let plantTargetEntry = proc.downstreamTargets.find(dt => dt.dishName === '全廠');
              if (!plantTargetEntry) {
                plantTargetEntry = { dishName: '全廠', targets: [] };
                proc.downstreamTargets.push(plantTargetEntry);
              }
              assignedRecipients.forEach(r => {
                if (!plantTargetEntry!.targets.some(t => t.processName === r.processName && t.isByproduct)) {
                  plantTargetEntry!.targets.push({
                    processName: r.processName,
                    machine: r.machine,
                    ratio: 1,
                    flowRate: 0.20,
                    isByproduct: true,
                    note: '副產物折抵'
                  });
                }
              });

              // 依據供餐需量與底料消耗之真實物理流率，動態重算分流配比 (最簡整數比)
              const allProcTargets: DownstreamTarget[] = [];
              proc.downstreamTargets.forEach(dt => {
                dt.targets.forEach(t => allProcTargets.push(t));
              });
              if (allProcTargets.length > 1) {
                const allRates = allProcTargets.map(t => t.flowRate !== undefined ? t.flowRate : 0.20);
                const intRatios = computeIntegerRatio(allRates);
                allProcTargets.forEach((t, idx) => {
                  t.ratio = intRatios[idx];
                });
              }

              bfSummary.offsetDetails.push(`由【${proc.processName}】過剩直供${recNames} (折抵 ${assignedRecipients.length} 台)`);
            }
          }
        });

        bfSummary.offsetCount = totalOffsetsAllocated;
        feederRow.parallelRounded = Math.max(0, feederRow.parallelRounded - totalOffsetsAllocated);
        feederRow.totalDemandRate = feederRow.parallelRounded;
        bfSummary.finalCount = feederRow.parallelRounded;
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

  const anyTransOver6 = allTransformations.some(t => t.demand > 6.0);
  const hasVoidFacility = totalProcessVoid > 0 ||
                          powerMode === 'overclock' ||
                          totalWaterDemand > 6.0 ||
                          totalOilDemand > 6.0 ||
                          anyTransOver6;

  // Autonomous Sizing for Plant-Wide Common Pumps
  const plantWater = sizeAutonomousPump(totalWaterDemand, hasVoidFacility);
  const plantOil = sizeAutonomousPump(totalOilDemand, hasVoidFacility);

  const sizedTransformations = allTransformations.map(t => ({
    ...t,
    ...sizeAutonomousPump(t.demand, hasVoidFacility)
  }));

  const transSludge = sizedTransformations.reduce((sum, t) => sum + t.sludgeManipulators, 0);
  const pumpSludgeVoid = (plantWater.sludgeManipulators + plantOil.sludgeManipulators + transSludge) * 1.0;

  // Generator Void Estimation
  const prelimPumpPower = plantWater.pumpPower + plantOil.pumpPower + sizedTransformations.reduce((sum, t) => sum + t.pumpPower, 0);
  const prelimBaseLoad = totalMainPower + prelimPumpPower;

  let genSludgeManipulators = 0;
  let generatorSludgeVoid = 0;
  if (powerMode === 'overclock') {
    const prelimFurnaces = Math.max(1, Math.ceil(prelimBaseLoad / 14.0));
    genSludgeManipulators = Math.ceil(prelimFurnaces / 2.0);
    generatorSludgeVoid = genSludgeManipulators * 1.0;
  }

  const totalPlantVoidDemand = Number((totalProcessVoid + pumpSludgeVoid + generatorSludgeVoid).toFixed(2));

  // Autonomous Void Pump sizing (modulo 7 ladder)
  let voidOverclockPumps = 0;
  let voidRegularPumps = 0;
  if (totalPlantVoidDemand > 0) {
    const rem7 = totalPlantVoidDemand % 7;
    voidOverclockPumps = Math.floor(totalPlantVoidDemand / 7) + (rem7 > 2.0 ? 1 : 0);
    voidRegularPumps = (rem7 > 0 && rem7 <= 2.0) ? 1 : 0;
  }
  const voidSludgeManipulators = voidOverclockPumps;
  const voidPumpPower = (voidOverclockPumps + voidRegularPumps + voidSludgeManipulators) * 1.0;

  const plantVoid = {
    demand: totalPlantVoidDemand,
    regularPumps: voidRegularPumps,
    overclockPumps: voidOverclockPumps,
    sludgeManipulators: voidSludgeManipulators,
    pumpPower: voidPumpPower,
    breakdown: {
      processVoid: totalProcessVoid,
      generatorSludgeVoid,
      pumpSludgeVoid
    }
  };

  // Plant-Wide Pump & Manipulator Totals
  const totalPlantRegularPumps = plantWater.regularPumps + plantOil.regularPumps + plantVoid.regularPumps +
                                 sizedTransformations.reduce((sum, t) => sum + t.regularPumps, 0);
  const totalPlantOverclockPumps = plantWater.overclockPumps + plantOil.overclockPumps + plantVoid.overclockPumps +
                                   sizedTransformations.reduce((sum, t) => sum + t.overclockPumps, 0);
  const totalPlantSludgeManipulators = plantWater.sludgeManipulators + plantOil.sludgeManipulators + plantVoid.sludgeManipulators +
                                       sizedTransformations.reduce((sum, t) => sum + t.sludgeManipulators, 0) +
                                       genSludgeManipulators;

  const totalPlantPumpPower = (totalPlantRegularPumps + totalPlantOverclockPumps + totalPlantSludgeManipulators) * 1.0;

  // Power Grid 2:1 Balance Calculation
  const baseForFurnace = totalMainPower + totalPlantPumpPower;
  const baseFeederRow = list.find(r => r.isBaseFeeder);
  const totalBaseFeederPower = baseFeederRow ? baseFeederRow.parallelRounded * 1.0 : 0;
  const totalPureMainPower = list.filter(r => !r.isBaseFeeder).reduce((acc, r) => acc + r.parallelRounded * r.powerPerUnit, 0);

  let furnaces = 0;
  let coalMiners = 0;
  let coalRate = 0;
  let grossPower = 0;
  let netPower = 0;
  let surplusPower = 0;

  if (powerMode === 'regular') {
    furnaces = Math.max(1, Math.ceil(baseForFurnace / 3.5));
    coalMiners = Math.ceil(furnaces / 2.0);
    grossPower = furnaces * 4.0;
    coalRate = Number((furnaces * 0.1).toFixed(2));
    const coalMinerPower = coalMiners * 1.0;
    const totalLoad = baseForFurnace + coalMinerPower;
    netPower = grossPower - coalMinerPower;
    surplusPower = Number((netPower - totalLoad).toFixed(2));
  } else {
    furnaces = Math.max(1, Math.ceil(baseForFurnace / 14.0));
    coalMiners = Math.ceil(furnaces / 2.0);
    genSludgeManipulators = Math.ceil(furnaces / 2.0);
    grossPower = furnaces * 16.0;
    coalRate = Number((furnaces * 0.1).toFixed(2));
    const coalMinerPower = coalMiners * 1.0;
    const totalLoad = baseForFurnace + coalMinerPower;
    netPower = grossPower - (coalMinerPower + genSludgeManipulators * 1.0);
    surplusPower = Number((netPower - totalLoad).toFixed(2));
  }

  const totalPlantPowerLoad = baseForFurnace + coalMiners * 1.0;
  const totalPlantGoblins = totalMainGoblins + furnaces * 1 + coalMiners * 1 + totalPlantPumpPower;

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
    plantWater,
    plantOil,
    plantVoid,
    sizedTransformations,
    allSauces,
    hasVoidFacility,
    totalPlantRegularPumps,
    totalPlantOverclockPumps,
    totalPlantSludgeManipulators,
    totalPlantPumpPower,
    furnaces,
    coalMiners,
    genSludgeManipulators,
    coalRate,
    grossPower,
    netPower,
    surplusPower,
    totalPlantPowerLoad,
    totalPlantGoblins
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

  const consolidated = consolidatePlan(individualResults, effectivePlannedList, powerMode, feederStrategy, intermediateRecipes);

  return { scorchingDishes, totalScorchingRateMin, effectivePlannedList, individualResults, combinedBiochemicalWarnings, consolidated };
}
