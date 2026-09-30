import React, { useState, useMemo } from 'react';
import { Recipe, ProcessNode, FeederStrategy, DownstreamTarget } from '../../types';
import { calculateSingleDish, sizeAutonomousPump, isScorchingDish, getProcessItemOutputRate } from '../../services/solver';
import { dataService } from '../../services/dataService';
import { getMachineBadgeClass, chunkTargets } from '../../utils/machineBadge';
import { RecipeSearchSelect } from '../Common/RecipeSearchSelect';
import { ItemIcon } from '../Common/ItemIcon';
import { Plus, Trash2, ShieldCheck, ShieldAlert, Zap, Droplets, Users, Flame, Sparkles, Sprout, Calculator } from 'lucide-react';
import { formatFractionOrDecimal, gcdArray } from '../../utils/math';

interface ParallelPlannerProps {
  recipes: Recipe[];
}

interface PlannedDish {
  id: string;
  dishName: string;
  rateMin: number; // dishes/min (e.g. 12 份/分 = 0.2 份/秒)
  isAutoAdded?: boolean;
}

export const ParallelPlanner: React.FC<ParallelPlannerProps> = ({ recipes }) => {
  const [powerMode, setPowerMode] = useState<'regular' | 'overclock'>('overclock');
  const [feederStrategy, setFeederStrategy] = useState<FeederStrategy>('dedicated');
  const [plannedList, setPlannedList] = useState<PlannedDish[]>([
    { id: '1', dishName: '鮮紅濃湯', rateMin: 12 },
  ]);

  const items = useMemo(() => dataService.getItems(), []);
  const intermediateRecipes = useMemo(() => dataService.getIntermediateRecipes(), []);

  const addDish = () => {
    const remaining = recipes.find(r => !plannedList.some(p => p.dishName === r.name));
    const nextDishName = remaining ? remaining.name : (recipes[0]?.name || '鮮紅濃湯');
    setPlannedList([...plannedList, { id: Date.now().toString(), dishName: nextDishName, rateMin: 12 }]);
  };

  const removeDish = (id: string) => {
    setPlannedList(plannedList.filter(p => p.id !== id));
  };

  const updateDish = (id: string, updates: Partial<PlannedDish>) => {
    setPlannedList(plannedList.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // 1. Identify all scorching dishes from user's planned list
  const scorchingDishes = useMemo(() => {
    return plannedList.filter(p => isScorchingDish(p.dishName, items, recipes));
  }, [plannedList, items, recipes]);

  // 2. Sum target rates of all scorching dishes
  const totalScorchingRateMin = useMemo(() => {
    return scorchingDishes.reduce((sum, p) => sum + (p.rateMin || 0), 0);
  }, [scorchingDishes]);

  // 3. Construct effective planned list
  const effectivePlannedList = useMemo(() => {
    if (totalScorchingRateMin <= 0) {
      return plannedList;
    }
    const hasPepto = plannedList.some(p => p.dishName === '胃復慘');
    if (hasPepto) {
      return plannedList.map(p => {
        if (p.dishName === '胃復慘') {
          return {
            ...p,
            rateMin: Math.max(p.rateMin, totalScorchingRateMin)
          };
        }
        return p;
      });
    }
    return [
      ...plannedList,
      {
        id: '__auto_pepto__',
        dishName: '胃復慘',
        rateMin: totalScorchingRateMin,
        isAutoAdded: true
      }
    ];
  }, [plannedList, totalScorchingRateMin]);

  // Compute individual calculation results (rate converted to dishes/s for solver)
  const individualResults = useMemo(() => {
    return effectivePlannedList.map(p => ({
      ...p,
      calc: calculateSingleDish(p.dishName, p.rateMin / 60, powerMode, feederStrategy)
    }));
  }, [effectivePlannedList, powerMode, feederStrategy]);

  // Combined Biochemical Warnings across all parallel dishes
  const combinedBiochemicalWarnings = useMemo(() => {
    const seen = new Set<string>();
    const warnings: { item: string; type: string; detail: string }[] = [];
    individualResults.forEach(r => {
      if (r.calc?.biochemicalWarnings) {
        r.calc.biochemicalWarnings.forEach(w => {
          const key = `${w.item}-${w.type}`;
          if (!seen.has(key)) {
            seen.add(key);
            warnings.push(w);
          }
        });
      }
    });
    return warnings;
  }, [individualResults]);

  // Aggregate and deduplicate common processes across dishes
  const consolidated = useMemo(() => {
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
      const parallelRounded = Math.ceil(record.totalDemandRate);
      const savedCount = record.independentSum - parallelRounded;
      return {
        ...record,
        parallelRounded,
        savedCount
      };
    });

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
          // Multi-dish parallel: clean previous feeder roles and recalculate strictly on merged physical flow
          list.forEach(proc => {
            proc.feederRoles = [];
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

            const rOut = getProcessItemOutputRate(proc.processName, proc.machine, intermediateRecipes);
            const surplusFlow = (proc.parallelRounded - proc.totalDemandRate) * rOut; // 量化物理淨產出流率 (items/second)

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
                      isByproduct: true,
                      note: '副產物折抵'
                    });
                  }
                });

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
        allTransformations.push({
          name: t.name,
          fluid: t.fluid,
          demand: t.demand
        });
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
      processes: list,
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
  }, [individualResults, powerMode]);

  return (
    <div className="space-y-6">
      {/* Selection Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 relative z-30">
        {/* Header Bar: Title on Left, Add Dish on Right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-amber-400" />
              <span>產線平衡計算機（支援單道料理速查 / 多料理自由並聯）</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              全製程自動化產線推導、連續流體與即時電網平衡；支援單道菜餚最小整數模組推導，亦可隨時新增多道料理自由並聯去重。
            </p>
          </div>

          <button
            onClick={addDish}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 whitespace-nowrap self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>新增並聯料理 ({plannedList.length})</span>
          </button>
        </div>

        {/* Global Strategy & Power Control Bar (與產線計算機樣式 100% 對齊，雙行防溢出防折行) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Power Mode Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 whitespace-nowrap">
              ⚡ 虛空熔爐發電模式
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPowerMode('regular')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                  powerMode === 'regular'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <span className="whitespace-nowrap">一級常規</span>
                <span className="font-mono text-slate-400 text-[10px] whitespace-nowrap">(4 FV/s)</span>
              </button>

              <button
                onClick={() => setPowerMode('overclock')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                  powerMode === 'overclock'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <span className="whitespace-nowrap">二級超頻 2:1:1</span>
                <span className="font-mono text-purple-400 text-[10px] whitespace-nowrap">(16 FV/s)</span>
              </button>
            </div>
          </div>

          {/* Base Feeder Strategy Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between whitespace-nowrap">
              <span>🌱 底料供給策略</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFeederStrategy('dedicated')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                  feederStrategy === 'dedicated'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
                title="每台底料需求設備配屬 1 台專用收割機直供底料 (最安全防呆、零死鎖)"
              >
                <span className="whitespace-nowrap">獨立專供</span>
                <span className="font-normal text-[10px] text-slate-400 font-sans whitespace-nowrap">(安全防呆)</span>
              </button>

              <button
                onClick={() => setFeederStrategy('recycle')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                  feederStrategy === 'recycle'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
                title="以嚴格物料流率量化利用產線過剩副產物作為底料，智慧折抵收割機台數"
              >
                <span className="flex items-center space-x-1 whitespace-nowrap">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 inline" />
                  <span>副產物折抵</span>
                </span>
                <span className="font-normal text-[10px] text-emerald-400 font-sans whitespace-nowrap">(智慧循環)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dish Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-1">
          {plannedList.map((item, idx) => (
            <div 
              key={item.id} 
              className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 relative group"
              style={{ zIndex: plannedList.length - idx + 10 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">料理 #{idx + 1}</span>
                {plannedList.length > 1 && (
                  <button
                    onClick={() => removeDish(item.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    title="移除此菜單"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div>
                <RecipeSearchSelect
                  recipes={recipes}
                  value={item.dishName}
                  onChange={(dishName) => updateDish(item.id, { dishName })}
                  size="sm"
                />
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-xs text-slate-400 whitespace-nowrap">目標速率 (份/分):</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={item.rateMin}
                  onChange={(e) => updateDish(item.id, { rateMin: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <div className="flex space-x-1 shrink-0">
                  {[12, 24, 36].map(val => (
                    <button
                      key={val}
                      onClick={() => updateDish(item.id, { rateMin: val })}
                      className={`px-1.5 py-0.5 text-[10px] rounded border transition-all whitespace-nowrap ${
                        item.rateMin === val
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Auto-Added 胃復慘 Card for Scorching Dishes */}
          {totalScorchingRateMin > 0 && !plannedList.some(p => p.dishName === '胃復慘') && (
            <div className="bg-amber-950/20 p-4 rounded-xl border border-amber-500/40 space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center space-x-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>聯動配餐</span>
                </span>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 rounded whitespace-nowrap">
                  系統自動加總
                </span>
              </div>

              <div className="flex items-center space-x-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <ItemIcon name="胃復慘" size="sm" />
                <div>
                  <div className="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
                    <span>胃復慘</span>
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1 rounded">10份/批</span>
                  </div>
                  <div className="text-[11px] text-amber-400/90 mt-0.5">
                    由 {scorchingDishes.length} 道熾熱料理自動配餐
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                <span className="text-slate-400 whitespace-nowrap">連帶出餐速率：</span>
                <span className="font-mono font-bold text-amber-300 text-sm whitespace-nowrap">
                  {totalScorchingRateMin} <span className="text-xs text-slate-400 font-sans">份/分</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scorching Auto-Pairing Banner */}
      {totalScorchingRateMin > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400">
              <Flame className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-amber-300 text-sm">🌶️ 熾熱菜餚自動配餐生效</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                  系統已自動並聯【胃復慘】
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                檢測到 {scorchingDishes.length} 道熾熱料理（{scorchingDishes.map(d => `${d.dishName} ${d.rateMin} 份/分`).join(' + ')}），巨獸食用時必須搭配【胃復慘】。系統已自動將其出餐效率加總並聯【胃復慘】合計 <span className="font-mono font-bold text-amber-400">{totalScorchingRateMin} 份/分</span> 同步出餐，全廠製程設備與基建負載已全面整合！
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Biochemical & Pipe Physical Isolation Alert (生化反應與管線實體隔離警示) */}
      {combinedBiochemicalWarnings.length > 0 && (
        <div className="bg-[#1e1317] border border-rose-500/40 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center space-x-2 text-rose-400 font-bold mb-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>生化反應與管線實體隔離警示</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {combinedBiochemicalWarnings.map((w, idx) => (
              <div key={idx} className="bg-[#140b0f] p-2.5 rounded-xl border border-rose-500/30">
                <span className="font-bold text-rose-300">【{w.type}】{w.item}：</span>
                <span className="text-slate-200">{w.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plant-Wide Shared Utilities & Pump Station (移至表格上方，與產線計算機保持一致) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fluids Pump Station */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
              <Droplets className="w-4 h-4 text-cyan-400" />
              <span>全廠公用流體泵站（自主超頻智慧階梯）</span>
            </h3>
            <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
              consolidated.hasVoidFacility
                ? 'bg-purple-900/40 text-purple-300 border border-purple-800/50'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {consolidated.hasVoidFacility ? '全廠有虛空 (門檻 > 2 fl/s)' : '全廠無虛空 (門檻 > 6 fl/s)'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Water Pump */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0"></span>
                  <span>全廠水資源外採</span>
                </div>
                <div className="text-slate-400 mt-0.5 whitespace-nowrap">
                  需量：<span className="font-mono text-cyan-300 font-bold">{consolidated.plantWater.demand}</span> fl/s
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-200 font-bold whitespace-nowrap">
                  {consolidated.plantWater.overclockPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1 whitespace-nowrap inline-block">
                      超頻泵 {consolidated.plantWater.overclockPumps} 台
                    </span>
                  )}
                  {consolidated.plantWater.regularPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded whitespace-nowrap inline-block">
                      常規泵 {consolidated.plantWater.regularPumps} 台
                    </span>
                  )}
                  {consolidated.plantWater.overclockPumps === 0 && consolidated.plantWater.regularPumps === 0 && (
                    <span className="text-slate-500 whitespace-nowrap">無需外採</span>
                  )}
                </div>
                {consolidated.plantWater.sludgeManipulators > 0 && (
                  <div className="text-[11px] text-purple-400 mt-1 whitespace-nowrap">
                    附帶汙泥操縱機：{consolidated.plantWater.sludgeManipulators} 台
                  </div>
                )}
              </div>
            </div>

            {/* Oil Pump */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                  <span>全廠油資源外採</span>
                </div>
                <div className="text-slate-400 mt-0.5 whitespace-nowrap">
                  需量：<span className="font-mono text-amber-300 font-bold">{consolidated.plantOil.demand}</span> fl/s
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-200 font-bold whitespace-nowrap">
                  {consolidated.plantOil.overclockPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1 whitespace-nowrap inline-block">
                      超頻泵 {consolidated.plantOil.overclockPumps} 台
                    </span>
                  )}
                  {consolidated.plantOil.regularPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded whitespace-nowrap inline-block">
                      常規泵 {consolidated.plantOil.regularPumps} 台
                    </span>
                  )}
                  {consolidated.plantOil.overclockPumps === 0 && consolidated.plantOil.regularPumps === 0 && (
                    <span className="text-slate-500 whitespace-nowrap">無需外採</span>
                  )}
                </div>
                {consolidated.plantOil.sludgeManipulators > 0 && (
                  <div className="text-[11px] text-purple-400 mt-1 whitespace-nowrap">
                    附帶汙泥操縱機：{consolidated.plantOil.sludgeManipulators} 台
                  </div>
                )}
              </div>
            </div>

            {/* In-situ Transformations */}
            {consolidated.sizedTransformations.length > 0 && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                  <span>原位轉化專屬抽取泵機</span>
                </div>
                {consolidated.sizedTransformations.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] border-t border-slate-800 pt-1.5">
                    <div>
                      <div className="text-slate-200 font-medium whitespace-nowrap">{t.name} ({t.fluid})</div>
                      <div className="text-slate-400 text-[10px]">
                        需量：<span className="font-mono text-rose-300 font-bold">{t.demand}</span> fl/s
                      </div>
                    </div>
                    <span className="font-mono text-slate-200 font-bold whitespace-nowrap">
                      {t.overclockPumps > 0 ? `超頻泵 ${t.overclockPumps} 台` : `常規泵 ${t.regularPumps} 台`}
                    </span>
                  </div>
                ))}
              </div>
            )}


            {/* Void Pump */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                  <span>全廠虛空流體總需量</span>
                </div>
                <div className="text-slate-400 mt-0.5 whitespace-nowrap">
                  總閉環需量：<span className="font-mono text-purple-300 font-bold">{consolidated.plantVoid.demand}</span> fl/s
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                  工藝: {consolidated.plantVoid.breakdown.processVoid} | 泵自耗: {consolidated.plantVoid.breakdown.pumpSludgeVoid} | 發電自耗: {consolidated.plantVoid.breakdown.generatorSludgeVoid}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-200 font-bold whitespace-nowrap">
                  {consolidated.plantVoid.overclockPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1 whitespace-nowrap inline-block">
                      超頻泵 {consolidated.plantVoid.overclockPumps} 台
                    </span>
                  )}
                  {consolidated.plantVoid.regularPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded whitespace-nowrap inline-block">
                      常規泵 {consolidated.plantVoid.regularPumps} 台
                    </span>
                  )}
                  {consolidated.plantVoid.overclockPumps === 0 && consolidated.plantVoid.regularPumps === 0 && (
                    <span className="text-slate-500 whitespace-nowrap">無需外採</span>
                  )}
                </div>
                {consolidated.plantVoid.sludgeManipulators > 0 && (
                  <div className="text-[11px] text-purple-400 mt-1 whitespace-nowrap">
                    附帶汙泥操縱機：{consolidated.plantVoid.sludgeManipulators} 台
                  </div>
                )}
              </div>
            </div>

            {/* Total pumps & manipulators summary */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
              <div className="text-slate-300 font-bold whitespace-nowrap flex items-center justify-between">
                <span>全廠泵機與操縱機總計:</span>
                <span className="text-cyan-300 font-mono font-bold whitespace-nowrap">
                  {consolidated.totalPlantRegularPumps} 常規泵 + {consolidated.totalPlantOverclockPumps} 超頻泵 + {consolidated.totalPlantSludgeManipulators} 操縱機
                </span>
              </div>
              {consolidated.genSludgeManipulators > 0 && (
                <div className="text-[10px] text-purple-400 font-sans whitespace-nowrap text-right">
                  (含電廠 2:1:1 模組供汙泥操縱機 {consolidated.genSludgeManipulators} 台)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Power Grid & Workforce Station */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>全廠電網負載與小妖精總結算</span>
            </h3>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                實需主設備: <strong className="text-cyan-300 font-bold">{consolidated.totalParallel}</strong> 台
              </span>
              <span className="text-xs text-slate-500 font-mono">|</span>
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                {powerMode === 'overclock' ? '2:1:1 閉環發電模組 (16 FV/s)' : '4 FV/s 常規發電模組'}
              </span>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {/* Furnace and Coal Miner */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                  <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>發電熔爐與採煤機配比</span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-300 whitespace-nowrap">
                  {consolidated.furnaces} 熔爐 : {consolidated.coalMiners} 採煤機
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] border-t border-slate-800 pt-2">
                <div className="whitespace-nowrap">淨發電總量：<span className="font-mono text-amber-300 font-bold">{consolidated.netPower} FV/s</span></div>
                <div className="whitespace-nowrap">電網盈餘：<span className="font-mono text-emerald-400 font-bold">+{consolidated.surplusPower} FV/s</span></div>
                <div className="whitespace-nowrap">煤炭消耗率：<span className="font-mono text-slate-200 font-bold">{consolidated.coalRate} 塊/秒</span></div>
                {powerMode === 'overclock' && (
                  <div className="whitespace-nowrap">汙泥操縱機：<span className="font-mono text-purple-300 font-bold">{consolidated.genSludgeManipulators} 台</span></div>
                )}
              </div>
            </div>

            {/* Four-way Power Breakdown */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-[11px]">
              <div className="font-bold text-slate-300 mb-1 whitespace-nowrap">電網垂直累加負載</div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="whitespace-nowrap">1. 主要生產設備負載：</span>
                <span className="font-mono text-slate-200 font-bold whitespace-nowrap">{consolidated.totalPureMainPower.toFixed(1)} FV/s</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="whitespace-nowrap">2. 流體泵機與操縱機自耗：</span>
                <span className="font-mono text-slate-200 font-bold whitespace-nowrap">{consolidated.totalPlantPumpPower.toFixed(1)} FV/s</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="whitespace-nowrap">3. 底料作物收割機：</span>
                <div className="flex items-center space-x-1.5 whitespace-nowrap">
                  {consolidated.baseFeederSummary && consolidated.baseFeederSummary.offsetCount > 0 && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-bold">
                      折抵 {consolidated.baseFeederSummary.offsetCount} 台
                    </span>
                  )}
                  <span className="font-mono text-slate-200 font-bold">{consolidated.totalBaseFeederPower.toFixed(1)} FV/s</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="whitespace-nowrap">4. 採煤機運行負載：</span>
                <span className="font-mono text-slate-200 font-bold whitespace-nowrap">{(consolidated.coalMiners * 1.0).toFixed(1)} FV/s</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800 pt-1 font-bold text-amber-400">
                <span className="whitespace-nowrap">全廠實時總負載：</span>
                <span className="font-mono whitespace-nowrap">{consolidated.totalPlantPowerLoad.toFixed(1)} FV/s</span>
              </div>
            </div>

            {/* Total Goblins */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>全廠所需小妖精總數</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  包含主產線、底料收割、泵機、操縱機與電廠
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold font-mono text-emerald-300">
                  {consolidated.totalPlantGoblins}
                </span>
                <span className="text-xs text-slate-400 ml-1">名</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Merged Process Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>跨料理共通設備去重合併分析表</span>
          </h3>
          <span className="text-xs text-slate-400">
            按總需求流率自動 CEILING 向上取整
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs">
                <th className="py-3 px-4 whitespace-nowrap">工序項目</th>
                <th className="py-3 px-4 whitespace-nowrap">設備</th>
                {consolidated.isSingleDish ? (
                  <>
                    <th className="py-3 px-4 text-right whitespace-nowrap" title="單台設備標準產出或消耗速率">單台產率</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap" title="理論精確需求台數">理論需量</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap text-cyan-300 font-bold" title="向上取整後的實際配置台數">實際台數</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap text-amber-300 font-bold" title="全線最簡整數比 (GCD)，便於模組化堆疊建造">整數比</th>
                  </>
                ) : (
                  <>
                    {effectivePlannedList.map(p => (
                      <th key={p.id} className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center space-x-1">
                            {p.isAutoAdded && (
                              <span className="text-[10px] text-amber-400 font-bold bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30 whitespace-nowrap">
                                配餐
                              </span>
                            )}
                            <span>{p.dishName}</span>
                          </div>
                          <span className="text-slate-400 font-mono text-[11px]">({p.rateMin} 份/分)</span>
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right whitespace-nowrap">並聯總需求</th>
                    <th className="py-3 px-4 text-right text-slate-400 whitespace-nowrap">獨立合計</th>
                    <th className="py-3 px-4 text-right font-bold text-cyan-300 whitespace-nowrap">並聯實需</th>
                    <th className="py-3 px-4 text-center text-emerald-400 font-bold whitespace-nowrap">節省設備</th>
                  </>
                )}
                <th className="py-3 px-4 text-right whitespace-nowrap">電力</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">哥布林</th>
                <th className="py-3 px-4 min-w-[320px]">物料關聯與拓撲說明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {consolidated.processes.map((r, idx) => {
                const isBaseFeeder = r.isBaseFeeder || r.processName.includes('底料作物採集');
                const isFullyOffsetFeeder = isBaseFeeder && r.parallelRounded === 0;

                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      isFullyOffsetFeeder
                        ? 'bg-emerald-950/20 text-emerald-200 border-t border-b border-emerald-500/30 hover:bg-emerald-950/30'
                        : isBaseFeeder
                        ? 'bg-purple-950/20 text-purple-200 border-t border-purple-500/30 hover:bg-purple-950/30'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* 1. 工序項目 */}
                    <td className="py-3 px-4 font-medium text-slate-100">
                      <div className="flex items-center space-x-2 whitespace-nowrap">
                        <ItemIcon name={r.processName} size="xs" />
                        {isBaseFeeder && (
                          <Sprout className={`w-4 h-4 shrink-0 ${isFullyOffsetFeeder ? 'text-emerald-400' : 'text-purple-400'}`} />
                        )}
                        <span>{r.processName}</span>
                      </div>

                      {/* Donors */}
                      {r.feederRoles.filter(fr => fr.role === 'donor').length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-1">
                          {r.feederRoles.filter(fr => fr.role === 'donor').map((fr, fIdx) => (
                            <span key={fIdx} className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-normal whitespace-nowrap">
                              <Zap className="w-3 h-3 text-emerald-400 inline shrink-0" />
                              <span>{effectivePlannedList.length > 1 ? `【${fr.dishName}】：` : ''}{fr.note}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Recipients */}
                      {r.feederRoles.filter(fr => fr.role === 'recipient').length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-1">
                          {r.feederRoles.filter(fr => fr.role === 'recipient').map((fr, fIdx) => (
                            <span key={fIdx} className="inline-flex items-center space-x-1 text-[11px] text-purple-300 font-normal whitespace-nowrap">
                              <Sprout className="w-3 h-3 text-purple-400 inline shrink-0" />
                              <span>{effectivePlannedList.length > 1 ? `【${fr.dishName}】：` : ''}{fr.note}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Base Feeder summary tag */}
                      {isBaseFeeder && r.baseFeederSummary && (
                        <div className="mt-1 text-[11px] font-normal whitespace-nowrap">
                          {r.baseFeederSummary.offsetCount > 0 ? (
                            <span className="text-emerald-300 flex items-center space-x-1 whitespace-nowrap">
                              <Sparkles className="w-3 h-3 text-emerald-400 inline shrink-0" />
                              <span>全廠由副產物折抵 {r.baseFeederSummary.offsetCount} 台底料收割機</span>
                            </span>
                          ) : (
                            <span className="text-purple-300/80 whitespace-nowrap">
                              每台底料需求設備 1:1 獨立配屬作物收割機
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 2. 設備 */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center space-x-1.5 whitespace-nowrap px-2 py-0.5 rounded text-xs font-mono border ${
                        isFullyOffsetFeeder
                          ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-200'
                          : isBaseFeeder
                          ? 'bg-purple-900/50 border-purple-500/40 text-purple-200'
                          : getMachineBadgeClass(r.machine)
                      }`}>
                        <ItemIcon name={r.machine} size="xs" showBorder={false} />
                        <span>{r.machine}</span>
                      </span>
                    </td>

                    {/* 3+. Dynamic Columns: Single Dish vs Multi Dish */}
                    {consolidated.isSingleDish ? (
                      <>
                        {/* 單台產率 */}
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                          {r.baseRateDisplay || (r.baseRate ? `${r.baseRate.toFixed(2)}/s` : '0.20/s')}
                        </td>
                        {/* 理論需量 */}
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                          {r.totalDemandRate.toFixed(2)} 台
                        </td>
                        {/* 實際台數 */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-base whitespace-nowrap">
                          {isFullyOffsetFeeder ? (
                            <span className="text-emerald-400">0 台</span>
                          ) : (
                            <span className="text-cyan-300">{r.parallelRounded} 台</span>
                          )}
                        </td>
                        {/* 整數比 */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-sm text-amber-300 whitespace-nowrap">
                          {isFullyOffsetFeeder ? '-' : (r.integerRatio || r.parallelRounded)}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* 各料理需求 */}
                        {effectivePlannedList.map(p => {
                          const found = r.dishDemands.find(d => d.dishName === p.dishName);
                          return (
                            <td key={p.id} className="py-3 px-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                              {found ? (
                                <div>
                                  <div className="whitespace-nowrap">{found.demand.toFixed(2)} 台</div>
                                  {found.feederRole === 'donor' && (
                                    <span className="text-[10px] text-emerald-400 block font-normal font-sans whitespace-nowrap">⚡ 過剩供給</span>
                                  )}
                                  {found.feederRole === 'recipient' && (
                                    <span className="text-[10px] text-purple-300 block font-normal font-sans whitespace-nowrap">🌱 接收底料</span>
                                  )}
                                  {isBaseFeeder && found.offsetCount && found.offsetCount > 0 ? (
                                    <span className="text-[10px] text-emerald-400 block font-normal font-sans whitespace-nowrap">
                                      (已折抵 {found.offsetCount} 台)
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* 並聯總需求 */}
                        <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                          {r.totalDemandRate.toFixed(2)} 台
                        </td>

                        {/* 獨立合計 */}
                        <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                          {r.independentSum} 台
                        </td>

                        {/* 並聯實需 */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-base whitespace-nowrap">
                          {isFullyOffsetFeeder ? (
                            <span className="text-emerald-400">0 台</span>
                          ) : (
                            <span className="text-cyan-300">{r.parallelRounded} 台</span>
                          )}
                        </td>

                        {/* 節省設備 */}
                        <td className="py-3 px-4 text-center font-mono font-bold whitespace-nowrap">
                          {isBaseFeeder && r.baseFeederSummary && r.baseFeederSummary.offsetCount > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold whitespace-nowrap">
                              折抵 {r.baseFeederSummary.offsetCount} 台
                            </span>
                          ) : r.savedCount > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs whitespace-nowrap">
                              節省 {r.savedCount} 台
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">-</span>
                          )}
                        </td>
                      </>
                    )}

                    {/* 電力 */}
                    <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                      {(r.parallelRounded * r.powerPerUnit).toFixed(1)} FV/s
                    </td>

                    {/* 哥布林 */}
                    <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                      {(r.parallelRounded * r.goblinsPerUnit).toFixed(0)} 隻
                    </td>

                    {/* 8. 物料關聯與拓撲說明 */}
                    <td className="py-3 px-4 text-xs">
                      {isBaseFeeder ? (
                        (() => {
                          const consumerLabel = r.baseFeederSummary?.consumerMachine || '物質操縱機';
                          if (r.baseFeederSummary && r.baseFeederSummary.offsetCount > 0) {
                            return (
                              <div className="flex items-center space-x-1.5 whitespace-nowrap" title={r.baseFeederSummary.offsetDetails.join('；')}>
                                <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(consumerLabel, true)}`}>
                                  {consumerLabel}
                                </span>
                                {r.parallelRounded === 0 ? (
                                  <span className="text-xs text-emerald-300 font-medium">
                                    🎉 (全廠副產物全額折抵免建)
                                  </span>
                                ) : (
                                  <span className="text-xs text-emerald-300 font-medium">
                                    (已折抵 {r.baseFeederSummary.offsetCount} 台，剩餘需直供)
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center space-x-1.5 whitespace-nowrap" title={`專線直供${consumerLabel}，每 5 秒消耗 1 份作物底料 (0.20/s 直供防堵專線)`}>
                              <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(consumerLabel)}`}>
                                {consumerLabel}
                              </span>
                              <span className="font-mono font-bold text-xs text-slate-200">1</span>
                              <span className="text-xs text-purple-300 font-normal">
                                (1:1 防堵專線)
                              </span>
                            </div>
                          );
                        })()
                      ) : r.machine === '自動廚師機' ? (
                        <span className="text-amber-400 font-bold whitespace-nowrap">終端出餐 (大炮發射)</span>
                      ) : r.downstreamTargets && r.downstreamTargets.length > 0 ? (
                        (() => {
                          const firstTargets = r.downstreamTargets[0]?.targets || [];
                          const allSame = r.downstreamTargets.every(dt =>
                            dt.targets.length === firstTargets.length &&
                            dt.targets.every((t, i) => t.machine === firstTargets[i].machine && t.ratio === firstTargets[i].ratio && t.isByproduct === firstTargets[i].isByproduct)
                          );

                          if (allSame) {
                            return (
                              <table className="border-separate border-spacing-y-1.5 border-spacing-x-0 text-xs w-auto">
                                <tbody>
                                  {chunkTargets(firstTargets).map((pair, rowIdx) => (
                                    <tr key={rowIdx} className="align-middle">
                                      {pair.map((t, tIdx) => (
                                        <td key={tIdx} className="pr-3.5 align-middle whitespace-nowrap">
                                          <div
                                            className="flex items-center space-x-1.5 whitespace-nowrap shrink-0"
                                            title={`連至工序：【${t.processName}】`}
                                          >
                                            <span className={`inline-flex items-center space-x-1 whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(t.machine, t.isByproduct)}`}>
                                              <ItemIcon name={t.machine} size="xs" showBorder={false} />
                                              <span>{t.machine}</span>
                                            </span>
                                            {t.isFluid ? (
                                              <span className="font-mono font-bold text-xs text-cyan-300">
                                                {t.note || `${t.ratio}.0 fl/s`}
                                              </span>
                                            ) : (
                                              <span className={`font-mono font-bold text-xs ${t.isByproduct ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                {t.ratio}
                                              </span>
                                            )}
                                            {t.isByproduct && (
                                              <span className="text-[10px] text-emerald-400 font-normal font-sans">(副產物折抵)</span>
                                            )}
                                          </div>
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          }

                          return (
                            <table className="border-separate border-spacing-y-1.5 border-spacing-x-0 text-xs w-auto">
                              <tbody>
                                {r.downstreamTargets.map((dt, dtIdx) => (
                                  <React.Fragment key={dtIdx}>
                                    {chunkTargets(dt.targets).map((pair, rowIdx) => (
                                      <tr key={rowIdx} className="align-middle">
                                        {effectivePlannedList.length > 1 && (
                                          <td className="pr-3 text-slate-400 font-medium whitespace-nowrap align-middle">
                                            {rowIdx === 0 ? `【${dt.dishName}】` : ''}
                                          </td>
                                        )}
                                        {pair.map((t, tIdx) => (
                                          <td key={tIdx} className="pr-3.5 align-middle whitespace-nowrap">
                                            <div
                                              className="flex items-center space-x-1.5 whitespace-nowrap shrink-0"
                                              title={`連至工序：【${t.processName}】`}
                                            >
                                              <span className={`inline-flex items-center space-x-1 whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(t.machine, t.isByproduct)}`}>
                                                <ItemIcon name={t.machine} size="xs" showBorder={false} />
                                                <span>{t.machine}</span>
                                              </span>
                                              {t.isFluid ? (
                                                <span className="font-mono font-bold text-xs text-cyan-300">
                                                  {t.note || `${t.ratio}.0 fl/s`}
                                                </span>
                                              ) : (
                                                <span className={`font-mono font-bold text-xs ${t.isByproduct ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                  {t.ratio}
                                                </span>
                                              )}
                                              {t.isByproduct && (
                                                <span className="text-[10px] text-emerald-400 font-normal font-sans">(副產物折抵)</span>
                                              )}
                                            </div>
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()
                      ) : (
                        <div className="text-slate-400">
                          {r.topologies.length > 0 ? (
                            r.topologies.length === 1 || r.topologies.every(t => t.text === r.topologies[0].text) ? (
                              <span>{r.topologies[0].text}</span>
                            ) : (
                              <table className="border-separate border-spacing-y-0.5 border-spacing-x-0 text-xs w-auto">
                                <tbody>
                                  {r.topologies.map((t, tIdx) => (
                                    <tr key={tIdx} className="text-slate-400">
                                      <td className="pr-2 text-slate-300 font-medium whitespace-nowrap align-top">
                                        【{t.dishName}】
                                      </td>
                                      <td className="align-top">
                                        {t.text}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPI Dashboard (表格下方效益總結) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {consolidated.isSingleDish ? (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">生產設備實需</div>
              <div className="text-2xl font-bold text-cyan-300 font-mono">
                {consolidated.totalParallel} <span className="text-sm font-normal text-slate-400">台</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">全製程主加工與採集設備</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">全廠總電力負載</div>
              <div className="text-2xl font-bold text-amber-300 font-mono">
                {consolidated.totalPlantPowerLoad.toFixed(1)} <span className="text-sm font-normal text-slate-400">FV/s</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                發電熔爐需 {consolidated.furnaces} 台 (採煤 {consolidated.coalMiners} 台)
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">總勞動哥布林配置</div>
              <div className="text-2xl font-bold text-emerald-300 font-mono">
                {consolidated.totalPlantGoblins} <span className="text-sm font-normal text-slate-400">隻</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">含主機、泵站與熔爐人力</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">公用泵站抽水抽油</div>
              <div className="text-2xl font-bold text-cyan-300 font-mono">
                {consolidated.totalPlantRegularPumps + consolidated.totalPlantOverclockPumps} <span className="text-sm font-normal text-slate-400">台泵</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                外採水/油/轉化流體專線
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">獨立規劃生產台數</div>
              <div className="text-2xl font-bold text-slate-300 font-mono">
                {consolidated.totalIndependent} <span className="text-sm font-normal text-slate-400">台</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">若各自獨立佈設</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">並聯整併生產台數</div>
              <div className="text-2xl font-bold text-cyan-300 font-mono">
                {consolidated.totalParallel} <span className="text-sm font-normal text-slate-400">台</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">合併共通收割/研磨設備</div>
            </div>

            <div className="bg-[#102922] border border-emerald-500/40 rounded-2xl p-4 shadow-lg shadow-emerald-950/20">
              <div className="text-xs text-emerald-400 mb-1 font-bold">🎉 為全廠節省設備</div>
              <div className="text-2xl font-bold text-emerald-300 font-mono">
                +{consolidated.totalSavedMachines} <span className="text-sm font-normal text-emerald-400">台</span>
              </div>
              <div className="text-xs text-emerald-400/80 mt-1">大幅壓縮佔地與管線複雜度</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 mb-1">全廠總電力負載</div>
              <div className="text-2xl font-bold text-amber-300 font-mono">
                {consolidated.totalPlantPowerLoad.toFixed(1)} <span className="text-sm font-normal text-slate-400">FV/s</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                發電熔爐需 {consolidated.furnaces} 台 (採煤 {consolidated.coalMiners} 台)
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
