import React, { useState, useMemo } from 'react';
import { Recipe, ProcessNode } from '../../types';
import { calculateSingleDish } from '../../services/solver';
import { Layers, Plus, Trash2, ShieldCheck } from 'lucide-react';

interface ParallelPlannerProps {
  recipes: Recipe[];
}

interface PlannedDish {
  id: string;
  dishName: string;
  rate: number; // dishes/s
}

export const ParallelPlanner: React.FC<ParallelPlannerProps> = ({ recipes }) => {
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
      calc: calculateSingleDish(p.dishName, p.rate, 'regular')
    }));
  }, [plannedList]);

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
    const totalPower = list.reduce((acc, r) => acc + r.parallelRounded * r.powerPerUnit, 0);
    const totalGoblins = list.reduce((acc, r) => acc + r.parallelRounded * r.goblinsPerUnit, 0);

    return {
      processes: list,
      totalIndependent,
      totalParallel,
      totalSavedMachines,
      totalPower,
      totalGoblins
    };
  }, [individualResults]);

  return (
    <div className="space-y-6">
      {/* Selection Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-amber-400" />
              <span>多料理並聯排程控制台（支援最多 3 道菜單並聯）</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              自動去重合併共通收割機、研磨機與攪拌機，消除產能浪費，追求極致空間與設備利用率。
            </p>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plannedList.map((item, idx) => (
            <div key={item.id} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">料理 #{idx + 1}</span>
                {plannedList.length > 1 && (
                  <button
                    onClick={() => removeDish(item.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
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
          <div className="text-xs text-slate-400 mb-1">獨立規劃合計台數</div>
          <div className="text-2xl font-bold text-slate-300 font-mono">
            {consolidated.totalIndependent} <span className="text-sm font-normal text-slate-400">台</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">若各自獨立佈設</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 mb-1">並聯實需台數</div>
          <div className="text-2xl font-bold text-cyan-300 font-mono">
            {consolidated.totalParallel} <span className="text-sm font-normal text-slate-400">台</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">合併共通原料設備</div>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          <div className="text-xs text-emerald-400 mb-1 font-bold">🎉 為全廠節省設備</div>
          <div className="text-2xl font-bold text-emerald-300 font-mono">
            +{consolidated.totalSavedMachines} <span className="text-sm font-normal text-emerald-400">台</span>
          </div>
          <div className="text-xs text-emerald-400 mt-1">節省大量空間與小妖精</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 mb-1">全廠並聯電力負載</div>
          <div className="text-2xl font-bold text-amber-300 font-mono">
            {consolidated.totalPower.toFixed(1)} <span className="text-sm font-normal text-slate-400">FV/s</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            發電熔爐需 ⌈{consolidated.totalPower.toFixed(1)} / 3.5⌉ 台
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
              {consolidated.processes.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-100">
                    {r.processName}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300 font-mono">
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
