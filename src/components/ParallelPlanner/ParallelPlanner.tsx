import React, { useState, useMemo } from 'react';
import { Recipe, ProcessNode, FeederStrategy } from '../../types';
import { calculateSingleDish, sizeAutonomousPump } from '../../services/solver';
import { Layers, Plus, Trash2, ShieldCheck, Zap, Droplets, Users, Flame, Sparkles } from 'lucide-react';

interface ParallelPlannerProps {
  recipes: Recipe[];
}

interface PlannedDish {
  id: string;
  dishName: string;
  rate: number; // dishes/s
}

export const ParallelPlanner: React.FC<ParallelPlannerProps> = ({ recipes }) => {
  const [powerMode, setPowerMode] = useState<'regular' | 'overclock'>('regular');
  const [feederStrategy, setFeederStrategy] = useState<FeederStrategy>('dedicated');
  const [plannedList, setPlannedList] = useState<PlannedDish[]>([
    { id: '1', dishName: '哀嚎肉丸', rate: 0.2 },
    { id: '2', dishName: '鮮紅濃湯', rate: 0.2 },
  ]);

  const addDish = () => {
    if (plannedList.length >= 3) return;
    const remaining = recipes.find(r => !plannedList.some(p => p.dishName === r.name));
    if (remaining) {
      setPlannedList([...plannedList, { id: Date.now().toString(), dishName: remaining.name, rate: 0.2 }]);
    }
  };

  const removeDish = (id: string) => {
    setPlannedList(plannedList.filter(p => p.id !== id));
  };

  const updateDish = (id: string, updates: Partial<PlannedDish>) => {
    setPlannedList(plannedList.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Compute individual calculation results
  const individualResults = useMemo(() => {
    return plannedList.map(p => ({
      ...p,
      calc: calculateSingleDish(p.dishName, p.rate, powerMode, feederStrategy)
    }));
  }, [plannedList, powerMode, feederStrategy]);

  // Aggregate and deduplicate common processes across dishes
  const consolidated = useMemo(() => {
    const processMap = new Map<string, {
      processName: string;
      machine: string;
      dishDemands: { dishName: string; demand: number }[];
      totalDemandRate: number;
      independentSum: number;
      parallelRounded: number;
      savedCount: number;
      powerPerUnit: number;
      goblinsPerUnit: number;
    }>();

    individualResults.forEach(item => {
      if (!item.calc) return;

      // 1. Regular process nodes
      item.calc.processes.forEach((p: ProcessNode) => {
        if (!processMap.has(p.processName)) {
          processMap.set(p.processName, {
            processName: p.processName,
            machine: p.machine,
            dishDemands: [],
            totalDemandRate: 0,
            independentSum: 0,
            parallelRounded: 0,
            savedCount: 0,
            powerPerUnit: p.countRounded > 0 ? p.power / p.countRounded : 0,
            goblinsPerUnit: p.countRounded > 0 ? p.goblins / p.countRounded : 0,
          });
        }
        const record = processMap.get(p.processName)!;
        record.dishDemands.push({ dishName: item.dishName, demand: p.demandRate });
        record.totalDemandRate += p.demandRate;
        record.independentSum += p.countRounded;
      });

      // 2. Base Feeder Harvester for matter manipulators
      if (item.calc.baseFeeders && item.calc.baseFeeders.count > 0) {
        const feederKey = '重構底料作物採集 (收割機 底料專供)';
        if (!processMap.has(feederKey)) {
          processMap.set(feederKey, {
            processName: feederKey,
            machine: '收割機',
            dishDemands: [],
            totalDemandRate: 0,
            independentSum: 0,
            parallelRounded: 0,
            savedCount: 0,
            powerPerUnit: 1.0,
            goblinsPerUnit: 1.0,
          });
        }
        const record = processMap.get(feederKey)!;
        record.dishDemands.push({ dishName: item.dishName, demand: item.calc.baseFeeders.count });
        record.totalDemandRate += item.calc.baseFeeders.count;
        record.independentSum += item.calc.baseFeeders.count;
      }
    });

    const list = Array.from(processMap.values()).map(record => {
      const parallelRounded = Math.ceil(record.totalDemandRate);
      const savedCount = record.independentSum - parallelRounded;
      return {
        ...record,
        parallelRounded,
        savedCount
      };
    });

    const totalIndependent = list.reduce((acc, r) => acc + r.independentSum, 0);
    const totalParallel = list.reduce((acc, r) => acc + r.parallelRounded, 0);
    const totalSavedMachines = totalIndependent - totalParallel;
    const totalMainPower = list.reduce((acc, r) => acc + r.parallelRounded * r.powerPerUnit, 0);
    const totalMainGoblins = list.reduce((acc, r) => acc + r.parallelRounded * r.goblinsPerUnit, 0);

    // Consolidated Plant-Wide Fluids System
    let totalWaterDemand = 0;
    let totalOilDemand = 0;
    let totalProcessVoid = 0;
    const allTransformations: { name: string; fluid: string; demand: number }[] = [];

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
      totalIndependent,
      totalParallel,
      totalSavedMachines,
      totalMainPower,
      totalMainGoblins,
      plantWater,
      plantOil,
      plantVoid,
      sizedTransformations,
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-amber-400" />
              <span>多料理並聯排程控制台（支援最多 3 道菜單並聯）</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              自動去重合併共通收割機、研磨機、攪拌機與公用流體泵站，消除產能浪費，追求極致空間與設備利用率。
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Power Mode Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setPowerMode('regular')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  powerMode === 'regular'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                常規發電 (4 FV/s)
              </button>
              <button
                onClick={() => setPowerMode('overclock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  powerMode === 'overclock'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                超頻發電 (16 FV/s)
              </button>
            </div>

            {/* Base Feeder Strategy Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setFeederStrategy('dedicated')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  feederStrategy === 'dedicated'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="每台物質操縱機配屬 1 台專用收割機直供底料 (最安全防呆、零死鎖)"
              >
                獨立專供底料
              </button>
              <button
                onClick={() => setFeederStrategy('recycle')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                  feederStrategy === 'recycle'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="自動利用研磨骨粉、發酵物等產線過剩副產物作為底料，節省收割機台數"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>副產物折抵</span>
              </button>
            </div>

            {plannedList.length < 3 && (
              <button
                onClick={addDish}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>新增並聯菜單</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plannedList.map((item, idx) => (
            <div key={item.id} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 relative group">
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
                <select
                  value={item.dishName}
                  onChange={(e) => updateDish(item.id, { dishName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {recipes.map(r => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-xs text-slate-400 whitespace-nowrap">目標速率 (份/秒):</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.01"
                  value={item.rate}
                  onChange={(e) => updateDish(item.id, { rate: parseFloat(e.target.value) || 0.1 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Savings Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          <div className="text-xs text-emerald-400 mb-1 font-bold">🎉 為全廠節省設備</div>
          <div className="text-2xl font-bold text-emerald-300 font-mono">
            +{consolidated.totalSavedMachines} <span className="text-sm font-normal text-emerald-400">台</span>
          </div>
          <div className="text-xs text-emerald-500 mt-1">大幅壓縮佔地與管線複雜度</div>
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
                <th className="py-3 px-4">工序項目</th>
                <th className="py-3 px-4">設備</th>
                {plannedList.map(p => (
                  <th key={p.id} className="py-3 px-4 text-right">
                    {p.dishName} 需求
                  </th>
                ))}
                <th className="py-3 px-4 text-right">並聯總需求</th>
                <th className="py-3 px-4 text-right text-slate-400">獨立合計</th>
                <th className="py-3 px-4 text-right font-bold text-cyan-300">並聯實需</th>
                <th className="py-3 px-4 text-center text-emerald-400 font-bold">節省設備</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {consolidated.processes.map((r, idx) => {
                const isBaseFeeder = r.processName.includes('重構底料');
                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      isBaseFeeder
                        ? 'bg-purple-950/20 text-purple-200 hover:bg-purple-950/30'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-slate-100">
                      {r.processName}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                        isBaseFeeder
                          ? 'bg-purple-900/50 text-purple-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {r.machine}
                      </span>
                    </td>
                    {plannedList.map(p => {
                      const found = r.dishDemands.find(d => d.dishName === p.dishName);
                      return (
                        <td key={p.id} className="py-3 px-4 text-right font-mono text-xs text-slate-400">
                          {found ? `${found.demand.toFixed(2)} 台` : '-'}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {r.totalDemandRate.toFixed(2)} 台
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {r.independentSum} 台
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-cyan-300 text-base">
                      {r.parallelRounded} 台
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      {r.savedCount > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs">
                          節省 {r.savedCount} 台
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plant-Wide Shared Utilities & Pump Station */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span>全廠水資源外採</span>
                </div>
                <div className="text-slate-400 mt-0.5">
                  需量：<span className="font-mono text-cyan-300 font-bold">{consolidated.plantWater.demand}</span> fl/s
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-200 font-bold">
                  {consolidated.plantWater.overclockPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1">
                      超頻泵 {consolidated.plantWater.overclockPumps} 台
                    </span>
                  )}
                  {consolidated.plantWater.regularPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded">
                      常規泵 {consolidated.plantWater.regularPumps} 台
                    </span>
                  )}
                  {consolidated.plantWater.overclockPumps === 0 && consolidated.plantWater.regularPumps === 0 && (
                    <span className="text-slate-500">無需外採</span>
                  )}
                </div>
                {consolidated.plantWater.sludgeManipulators > 0 && (
                  <div className="text-[11px] text-purple-400 mt-1">
                    附帶汙泥操縱機：{consolidated.plantWater.sludgeManipulators} 台
                  </div>
                )}
              </div>
            </div>

            {/* Oil Pump */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>全廠油資源外採</span>
                </div>
                <div className="text-slate-400 mt-0.5">
                  需量：<span className="font-mono text-amber-300 font-bold">{consolidated.plantOil.demand}</span> fl/s
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-200 font-bold">
                  {consolidated.plantOil.overclockPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1">
                      超頻泵 {consolidated.plantOil.overclockPumps} 台
                    </span>
                  )}
                  {consolidated.plantOil.regularPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded">
                      常規泵 {consolidated.plantOil.regularPumps} 台
                    </span>
                  )}
                  {consolidated.plantOil.overclockPumps === 0 && consolidated.plantOil.regularPumps === 0 && (
                    <span className="text-slate-500">無需外採</span>
                  )}
                </div>
                {consolidated.plantOil.sludgeManipulators > 0 && (
                  <div className="text-[11px] text-purple-400 mt-1">
                    附帶汙泥操縱機：{consolidated.plantOil.sludgeManipulators} 台
                  </div>
                )}
              </div>
            </div>

            {/* In-situ Transformations */}
            {consolidated.sizedTransformations.length > 0 && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span>原位轉化專屬抽取泵機</span>
                </div>
                {consolidated.sizedTransformations.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] border-t border-slate-800 pt-1.5">
                    <span className="text-slate-300">{t.name} ({t.fluid})</span>
                    <span className="font-mono text-slate-200 font-bold">
                      {t.overclockPumps > 0 ? `超頻泵 ${t.overclockPumps} 台` : `常規泵 ${t.regularPumps} 台`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Void Pump */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  <span>全廠虛空流體總需量</span>
                </div>
                <div className="text-slate-400 mt-0.5">
                  總閉環需量：<span className="font-mono text-purple-300 font-bold">{consolidated.plantVoid.demand}</span> fl/s
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  工藝: {consolidated.plantVoid.breakdown.processVoid} | 泵自耗: {consolidated.plantVoid.breakdown.pumpSludgeVoid} | 發電自耗: {consolidated.plantVoid.breakdown.generatorSludgeVoid}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-200 font-bold">
                  {consolidated.plantVoid.overclockPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1">
                      超頻泵 {consolidated.plantVoid.overclockPumps} 台
                    </span>
                  )}
                  {consolidated.plantVoid.regularPumps > 0 && (
                    <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">
                      常規泵 {consolidated.plantVoid.regularPumps} 台
                    </span>
                  )}
                  {consolidated.plantVoid.overclockPumps === 0 && consolidated.plantVoid.regularPumps === 0 && (
                    <span className="text-slate-500">無需外採</span>
                  )}
                </div>
                {consolidated.plantVoid.sludgeManipulators > 0 && (
                  <div className="text-[11px] text-purple-400 mt-1">
                    附帶汙泥操縱機：{consolidated.plantVoid.sludgeManipulators} 台
                  </div>
                )}
              </div>
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
            <span className="text-xs text-slate-400 font-mono">
              2:1:1 閉環發電模組
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Furnace and Coal Miner */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>發電熔爐與採煤機配比</span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-300">
                  {consolidated.furnaces} 熔爐 : {consolidated.coalMiners} 採煤機
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] border-t border-slate-800 pt-2">
                <div>淨發電總量：<span className="font-mono text-amber-300 font-bold">{consolidated.netPower} FV/s</span></div>
                <div>電網盈餘：<span className="font-mono text-emerald-400 font-bold">+{consolidated.surplusPower} FV/s</span></div>
                <div>煤炭消耗率：<span className="font-mono text-slate-200 font-bold">{consolidated.coalRate} 塊/秒</span></div>
                {powerMode === 'overclock' && (
                  <div>汙泥操縱機：<span className="font-mono text-purple-300 font-bold">{consolidated.genSludgeManipulators} 台</span></div>
                )}
              </div>
            </div>

            {/* Four-way Power Breakdown */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-[11px]">
              <div className="font-bold text-slate-300 mb-1">電網四重垂直累加負載</div>
              <div className="flex justify-between text-slate-400">
                <span>1. 主要生產設備負載：</span>
                <span className="font-mono text-slate-200 font-bold">{consolidated.totalMainPower.toFixed(1)} FV/s</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>2. 流體泵機與操縱機自耗：</span>
                <span className="font-mono text-slate-200 font-bold">{consolidated.totalPlantPumpPower.toFixed(1)} FV/s</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>3. 採煤機運行負載：</span>
                <span className="font-mono text-slate-200 font-bold">{(consolidated.coalMiners * 1.0).toFixed(1)} FV/s</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1 font-bold text-amber-400">
                <span>全廠實時總負載：</span>
                <span className="font-mono">{consolidated.totalPlantPowerLoad.toFixed(1)} FV/s</span>
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
    </div>
  );
};
