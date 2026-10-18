import React, { useState, useMemo } from 'react';
import { Sparkles, Plus, Trash2, Zap, Flame, RefreshCw, Layers, ArrowRight } from 'lucide-react';
import { Recipe, IntermediateRecipe, Machine, Item } from '../../types';
import { SandboxPlanConfig } from './sandboxTypes';
import { isScorchingDish } from '../../services/solver';

interface SandboxPlannerTabProps {
  recipes: Recipe[];
  intermediate: IntermediateRecipe[];
  machines: Machine[];
  items: Item[];
  onGeneratePlant: (config: SandboxPlanConfig, autoAudit?: boolean) => void;
  onAddBlankChef: () => void;
}

interface PlannedDishEntry {
  dishName: string;
  rateMin: number;
}

const PRESET_RATES = [12, 18, 24, 36, 60];

export const SandboxPlannerTab: React.FC<SandboxPlannerTabProps> = ({
  recipes,
  items,
  onGeneratePlant,
  onAddBlankChef
}) => {
  const [plannedDishes, setPlannedDishes] = useState<PlannedDishEntry[]>(() => [
    { dishName: recipes[0]?.name || '', rateMin: 12 }
  ]);
  const [powerMode, setPowerMode] = useState<'overclock' | 'regular'>('overclock');
  const [feedingStrategy, setFeedingStrategy] = useState<'recycle' | 'dedicated'>('recycle');
  const [selectedIsland, setSelectedIsland] = useState<string>('ALL');

  // 所有島嶼清單
  const islands = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach(r => {
      if (r.island) set.add(r.island);
    });
    return Array.from(set);
  }, [recipes]);

  // 依島嶼篩選之料理清單
  const availableRecipes = useMemo(() => {
    if (selectedIsland === 'ALL') return recipes;
    return recipes.filter(r => r.island === selectedIsland);
  }, [recipes, selectedIsland]);

  // 檢測選中料理中是否包含熾熱料理
  const hasScorching = useMemo(() => {
    return plannedDishes.some(d => {
      return d.dishName ? isScorchingDish(d.dishName, items, recipes) : false;
    });
  }, [plannedDishes, items, recipes]);

  // 動態尋找中和緩和劑食譜名稱 (資料驅動，不寫死名稱)
  const peptoDishName = useMemo(() => {
    const pepto = recipes.find(r => r.notes?.includes('中和') && (r.notes.includes('熾熱') || r.notes.includes('灼熱')));
    return pepto ? pepto.name : '緩和劑';
  }, [recipes]);

  // 更新單列料理
  const handleUpdateDish = (index: number, dishName: string) => {
    setPlannedDishes(prev => {
      const next = [...prev];
      next[index] = { ...next[index], dishName };
      return next;
    });
  };

  // 更新單列產量
  const handleUpdateRate = (index: number, rateMin: number) => {
    setPlannedDishes(prev => {
      const next = [...prev];
      next[index] = { ...next[index], rateMin: Math.max(0.1, Number(rateMin) || 1) };
      return next;
    });
  };

  // 新增並聯料理
  const handleAddDishRow = () => {
    const remaining = recipes.find(r => !plannedDishes.some(d => d.dishName === r.name));
    const nextName = remaining ? remaining.name : (recipes[0]?.name || '');
    setPlannedDishes(prev => [...prev, { dishName: nextName, rateMin: 12 }]);
  };

  // 移除並聯料理
  const handleRemoveDishRow = (index: number) => {
    if (plannedDishes.length <= 1) return;
    setPlannedDishes(prev => prev.filter((_, idx) => idx !== index));
  };

  // 建立當前產線規劃設定
  const buildCurrentConfig = (): SandboxPlanConfig => ({
    plannedDishes: plannedDishes.filter(d => Boolean(d.dishName)),
    powerMode,
    feedingStrategy
  });

  return (
    <div className="flex flex-col h-full space-y-3.5 p-3 text-xs overflow-y-auto">
      
      {/* 標題與島嶼篩選 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200 flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>動態產線規劃生成器</span>
          </span>
          <button
            onClick={onAddBlankChef}
            className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="僅放置單台空白廚師機到畫布"
          >
            ➕ 空廚師機
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          設定任意目標料理與產量，系統將動態計算最簡機台比與管網拓撲，全自動生成完整實體產線。
        </p>

        {islands.length > 0 && (
          <div className="flex items-center space-x-1 overflow-x-auto py-1 scrollbar-none text-[10px]">
            <button
              onClick={() => setSelectedIsland('ALL')}
              className={`px-2 py-0.5 rounded-lg font-bold shrink-0 transition-colors ${
                selectedIsland === 'ALL'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部島嶼
            </button>
            {islands.map(isle => (
              <button
                key={isle}
                onClick={() => setSelectedIsland(isle)}
                className={`px-2 py-0.5 rounded-lg font-bold shrink-0 transition-colors ${
                  selectedIsland === isle
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isle}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 料理清單區塊 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
          <span>出餐計畫 (支援多料理並聯)</span>
          <span className="text-slate-500 text-[10px] font-mono">{plannedDishes.length} 道料理</span>
        </div>

        <div className="space-y-2">
          {plannedDishes.map((dish, idx) => {
            const isScorching = dish.dishName ? isScorchingDish(dish.dishName, items, recipes) : false;

            return (
              <div 
                key={idx} 
                className="bg-[#0e171e] p-2.5 rounded-xl border border-slate-800 space-y-2 relative group hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center space-x-1.5">
                  <select
                    value={dish.dishName}
                    onChange={(e) => handleUpdateDish(idx, e.target.value)}
                    className="flex-1 bg-[#060c10] border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-bold focus:outline-none focus:border-purple-500"
                  >
                    {availableRecipes.map(r => (
                      <option key={r.name} value={r.name}>
                        {r.name} {isScorchingDish(r.name, items, recipes) ? '🌶️' : ''}
                      </option>
                    ))}
                  </select>

                  {plannedDishes.length > 1 && (
                    <button
                      onClick={() => handleRemoveDishRow(idx)}
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                      title="移除此道料理"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 產能設定列 */}
                <div className="flex items-center justify-between space-x-1 text-[11px]">
                  <div className="flex items-center space-x-1 font-mono">
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={dish.rateMin}
                      onChange={(e) => handleUpdateRate(idx, parseFloat(e.target.value))}
                      className="w-16 bg-[#060c10] border border-slate-700 rounded px-1.5 py-0.5 text-amber-300 font-bold text-center focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-400">份/分</span>
                  </div>

                  {/* 快捷產能按鈕 */}
                  <div className="flex items-center space-x-0.5">
                    {PRESET_RATES.map(preset => (
                      <button
                        key={preset}
                        onClick={() => handleUpdateRate(idx, preset)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                          dish.rateMin === preset
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {isScorching && (
                  <div className="text-[10px] text-orange-400 flex items-center space-x-1">
                    <Flame className="w-3 h-3 text-orange-500" />
                    <span>熾熱料理 (自動聯動中和配餐)</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 新增並聯料理按鈕 */}
        <button
          onClick={handleAddDishRow}
          className="w-full py-1.5 rounded-xl border border-dashed border-slate-700 hover:border-purple-500/50 text-slate-400 hover:text-purple-300 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 bg-slate-900/30 hover:bg-purple-950/20"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>＋ 新增並聯料理</span>
        </button>
      </div>

      {/* 熾熱料理提示橫幅 */}
      {hasScorching && (
        <div className="p-2 rounded-xl bg-orange-950/30 border border-orange-500/40 text-[11px] text-orange-300 flex items-center space-x-1.5">
          <Flame className="w-4 h-4 text-orange-400 shrink-0" />
          <span>含熾熱料理：生成時將自動配產【{peptoDishName}】產線</span>
        </div>
      )}

      {/* 全廠基建策略設定 (預設：超頻發電 + 副產物折抵) */}
      <div className="bg-[#0e171e] p-3 rounded-2xl border border-slate-800 space-y-2.5">
        <span className="font-bold text-slate-300 text-[11px] block">全廠基建策略</span>

        {/* 發電模式 */}
        <div className="space-y-1">
          <div className="text-[10px] text-slate-400">發電廠模組配置：</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              onClick={() => setPowerMode('overclock')}
              className={`p-1.5 rounded-xl border font-bold text-left transition-all ${
                powerMode === 'overclock'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>⚡ 二級超頻</span>
              </div>
              <div className="text-[9px] text-slate-400 font-normal mt-0.5">16 FV/s (2:1:1 模組)</div>
            </button>

            <button
              onClick={() => setPowerMode('regular')}
              className={`p-1.5 rounded-xl border font-bold text-left transition-all ${
                powerMode === 'regular'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-1">
                <Flame className="w-3 h-3 text-slate-400" />
                <span>🔥 一級常規</span>
              </div>
              <div className="text-[9px] text-slate-400 font-normal mt-0.5">4 FV/s (純燃煤)</div>
            </button>
          </div>
        </div>

        {/* 底料策略 */}
        <div className="space-y-1 pt-1 border-t border-slate-800/80">
          <div className="text-[10px] text-slate-400">原料底料供給模式：</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              onClick={() => setFeedingStrategy('recycle')}
              className={`p-1.5 rounded-xl border font-bold text-left transition-all ${
                feedingStrategy === 'recycle'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-1">
                <RefreshCw className="w-3 h-3 text-teal-400" />
                <span>♻️ 副產物折抵</span>
              </div>
              <div className="text-[9px] text-slate-400 font-normal mt-0.5">全廠循環拓撲</div>
            </button>

            <button
              onClick={() => setFeedingStrategy('dedicated')}
              className={`p-1.5 rounded-xl border font-bold text-left transition-all ${
                feedingStrategy === 'dedicated'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-1">
                <Layers className="w-3 h-3 text-slate-400" />
                <span>🌾 專屬直供</span>
              </div>
              <div className="text-[9px] text-slate-400 font-normal mt-0.5">獨立收割線</div>
            </button>
          </div>
        </div>
      </div>

      {/* 雙行動按鈕 */}
      <div className="space-y-2 pt-1">
        {/* 主按鈕：生成並自動體檢 */}
        <button
          onClick={() => onGeneratePlant(buildCurrentConfig(), true)}
          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-teal-600 hover:from-purple-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-[0.99]"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>🚀 生成產線並體檢 (雙階驗證)</span>
        </button>

        {/* 次按鈕：僅生成至畫布 */}
        <button
          onClick={() => onGeneratePlant(buildCurrentConfig(), false)}
          className="w-full py-1.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-slate-100 font-medium text-xs border border-slate-700 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
        >
          <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          <span>📐 僅生成至畫布</span>
        </button>
      </div>

    </div>
  );
};
