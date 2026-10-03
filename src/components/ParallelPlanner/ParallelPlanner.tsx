import React, { useState, useMemo } from 'react';
import { Recipe, FeederStrategy } from '../../types';
import { runParallelPlan, PlannedDish } from '../../services/parallelPlanner';
import { RecipeSearchSelect } from '../Common/RecipeSearchSelect';
import { ItemIcon } from '../Common/ItemIcon';
import { FluidStation } from './FluidStation';
import { PowerStation } from './PowerStation';
import { ProcessTable } from './ProcessTable';
import { KpiSummary } from './KpiSummary';
import { Plus, Trash2, ShieldAlert, Flame, Sparkles, Calculator } from 'lucide-react';

interface ParallelPlannerProps {
  recipes: Recipe[];
}

export const ParallelPlanner: React.FC<ParallelPlannerProps> = ({ recipes }) => {
  const [powerMode, setPowerMode] = useState<'regular' | 'overclock'>('overclock');
  const [feederStrategy, setFeederStrategy] = useState<FeederStrategy>('dedicated');
  const [plannedList, setPlannedList] = useState<PlannedDish[]>([
    { id: '1', dishName: '鮮紅濃湯', rateMin: 12 },
  ]);

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

  // 全部運算委派至純運算層 services/parallelPlanner.ts
  const { scorchingDishes, totalScorchingRateMin, effectivePlannedList, combinedBiochemicalWarnings, consolidated } = useMemo(
    () => runParallelPlan(plannedList, powerMode, feederStrategy, recipes),
    [plannedList, powerMode, feederStrategy, recipes]
  );

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
                <ItemIcon name="自動廚師機" size="sm" />
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
        <FluidStation consolidated={consolidated} />
        <PowerStation consolidated={consolidated} powerMode={powerMode} />
      </div>

      {/* Merged Process Table */}
      <ProcessTable consolidated={consolidated} effectivePlannedList={effectivePlannedList} />

      {/* KPI Dashboard (表格下方效益總結) */}
      <KpiSummary consolidated={consolidated} />
    </div>
  );
};
