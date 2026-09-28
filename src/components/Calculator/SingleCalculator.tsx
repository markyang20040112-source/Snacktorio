import React, { useState, useMemo } from 'react';
import { calculateSingleDish } from '../../services/solver';
import { Recipe, FeederStrategy } from '../../types';
import { 
  Zap, Droplet, Users, Cog, ShieldAlert,
  Pipette, Sprout, ArrowRight, Activity, Sparkles
} from 'lucide-react';

interface SingleCalculatorProps {
  recipes: Recipe[];
}

export const SingleCalculator: React.FC<SingleCalculatorProps> = ({ recipes }) => {
  const [selectedDish, setSelectedDish] = useState<string>(recipes[0]?.name || '驚嚇醃薑');
  const [targetRate, setTargetRate] = useState<number>(0.2); // dishes/s
  const [rateUnit, setRateUnit] = useState<'sec' | 'min'>('sec');
  const [powerMode, setPowerMode] = useState<'regular' | 'overclock'>('overclock');
  const [feederStrategy, setFeederStrategy] = useState<FeederStrategy>('dedicated');

  // Rate in dishes/s
  const actualRateSec = rateUnit === 'min' ? targetRate / 60 : targetRate;

  // Calculation Result
  const result = useMemo(() => {
    return calculateSingleDish(selectedDish, actualRateSec, powerMode, feederStrategy);
  }, [selectedDish, actualRateSec, powerMode, feederStrategy]);

  // Group recipes by island
  const islandGroups = useMemo(() => {
    const map = new Map<string, Recipe[]>();
    recipes.forEach(r => {
      const isl = r.island || '其他島嶼';
      if (!map.has(isl)) map.set(isl, []);
      map.get(isl)!.push(r);
    });
    return Array.from(map.entries());
  }, [recipes]);

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Dish Selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              🍽️ 選擇目標出餐料理
            </label>
            <select
              value={selectedDish}
              onChange={(e) => setSelectedDish(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            >
              {islandGroups.map(([island, list]) => (
                <optgroup key={island} label={`🏝️ ${island}`}>
                  {list.map(r => (
                    <option key={r.name} value={r.name}>
                      {r.name} {r.fluidType !== '無' ? `(+${r.fluidType})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Target Rate Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-300">
                ⏱️ 目標出餐速率
              </label>
              <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => {
                    if (rateUnit === 'min') {
                      setTargetRate(Number((targetRate / 60).toFixed(2)));
                      setRateUnit('sec');
                    }
                  }}
                  className={`px-2 py-0.5 rounded ${rateUnit === 'sec' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  份/秒
                </button>
                <button
                  onClick={() => {
                    if (rateUnit === 'sec') {
                      setTargetRate(Math.round(targetRate * 60));
                      setRateUnit('min');
                    }
                  }}
                  className={`px-2 py-0.5 rounded ${rateUnit === 'min' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  份/分
                </button>
              </div>
            </div>
            <div className="flex space-x-2">
              <input
                type="number"
                step={rateUnit === 'sec' ? '0.05' : '1'}
                min="0.01"
                value={targetRate}
                onChange={(e) => setTargetRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
              />
              <div className="flex space-x-1">
                {[0.1, 0.2, 0.4].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      setRateUnit('sec');
                      setTargetRate(val);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                      rateUnit === 'sec' && targetRate === val
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Power Mode Toggle */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              ⚡ 虛空熔爐發電模式
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPowerMode('regular')}
                className={`flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                  powerMode === 'regular'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                }`}
              >
                <span>一級常規</span>
                <span className="font-mono text-slate-400">(4 FV/s)</span>
              </button>

              <button
                onClick={() => setPowerMode('overclock')}
                className={`flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                  powerMode === 'overclock'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                }`}
              >
                <span>二級超頻 2:1:1</span>
                <span className="font-mono text-purple-400">(16 FV/s)</span>
              </button>
            </div>
          </div>

          {/* Base Feeder Strategy Toggle */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center justify-between">
              <span>🌱 重構底料供給策略</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFeederStrategy('dedicated')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                  feederStrategy === 'dedicated'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                }`}
                title="每台物質操縱機配屬 1 台專用收割機直供底料 (最安全防呆、零死鎖)"
              >
                <span>獨立專供</span>
                <span className="font-normal text-[10px] text-slate-400 font-sans">(安全防呆)</span>
              </button>

              <button
                onClick={() => setFeederStrategy('recycle')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                  feederStrategy === 'recycle'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                }`}
                title="自動利用研磨骨粉、發酵物等產線過剩副產物作為底料，節省收割機台數"
              >
                <span className="flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-emerald-400 inline" />
                  <span>副產物折抵</span>
                </span>
                <span className="font-normal text-[10px] text-emerald-400 font-mono">(智慧循環)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {result ? (
        <>
          {/* Biochemical Warnings Banner */}
          {result.biochemicalWarnings.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <div className="flex items-center space-x-2 text-red-400 font-bold mb-2">
                <ShieldAlert className="w-5 h-5" />
                <span>生化反應與管線實體隔離警示</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {result.biochemicalWarnings.map((w, idx) => (
                  <div key={idx} className="bg-slate-950/60 p-2.5 rounded-xl border border-red-500/20">
                    <span className="font-bold text-red-300">【{w.type}】{w.item}：</span>
                    <span className="text-slate-300">{w.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standard Four-Quadrant Dashboard (Row 7~13 完整標準重現) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            
            {/* Quadrant 1 (左區 A~D 欄): 全廠綜合總結算 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="font-bold text-slate-100 text-xs flex items-center space-x-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>【全廠綜合總結算】</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    實需主設備: {result.totalMachineCount} 台
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>主設備電力 (純料理):</span>
                    <span className="font-mono text-slate-200">{result.powerGrid.mainEquipmentPower} FV/s</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>泵機與操縱機電力 (Q13):</span>
                    <span className="font-mono text-cyan-300">{result.powerGrid.pumpManipulatorPower} FV/s</span>
                  </div>
                  
                  {/* 重構底料機耗電 */}
                  <div className={`flex justify-between px-2 py-1 rounded-lg border ${
                    result.baseFeeders.offsetCount > 0
                      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-purple-300 bg-purple-500/10 border-purple-500/20'
                  }`}>
                    <div className="flex items-center space-x-1.5">
                      <span>重構底料機耗電 ({result.baseFeeders.count} 台):</span>
                      {result.baseFeeders.offsetCount > 0 && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-900/60 text-emerald-300 font-bold">
                          已折抵 {result.baseFeeders.offsetCount} 台
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold">{result.powerGrid.baseFeederPower} FV/s</span>
                  </div>

                  <div className="flex justify-between text-slate-400">
                    <span>採煤機耗電 ({result.powerGrid.coalMiners} 台):</span>
                    <span className="font-mono text-slate-200">{result.powerGrid.coalMinerPower} FV/s</span>
                  </div>

                  <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm font-bold text-amber-400">
                    <span>⚡ 全廠總電力負載:</span>
                    <span className="font-mono text-base">{result.powerGrid.totalLoad} FV/s</span>
                  </div>
                </div>
              </div>

              {/* Power supply generator specs & total goblins */}
              <div className="mt-4 pt-3 border-t border-slate-800 text-xs space-y-1.5 bg-slate-950/70 p-3 rounded-xl border border-slate-850">
                <div className="flex justify-between items-center text-slate-300">
                  <span>所需虛空熔爐:</span>
                  <span className="font-mono font-bold text-amber-300">
                    {result.powerGrid.furnaces} 台 <span className="font-normal text-[10px] text-slate-400">({powerMode === 'overclock' ? '16 FV/s 模組' : '4 FV/s'})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>煤炭消耗速率:</span>
                  <span className="font-mono">{result.powerGrid.coalRate} 個/秒</span>
                </div>
                <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-850 font-bold">
                  <span className="flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>👥 全廠總小妖精:</span>
                  </span>
                  <span className="font-mono text-emerald-300 text-sm">
                    {result.goblinsBreakdown.total} 個
                  </span>
                </div>
              </div>
            </div>

            {/* Quadrant 2 (中區一 E~G 欄): 廠內調配醬汁清單 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="font-bold text-slate-100 text-xs flex items-center space-x-1.5">
                    <Pipette className="w-4 h-4 text-amber-400" />
                    <span>【廠內調配醬汁清單】</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                    1:1 專線 (嚴禁合流)
                  </span>
                </div>

                {result.fluids.sauces.length > 0 ? (
                  <div className="space-y-2">
                    {result.fluids.sauces.map((s, idx) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs space-y-1">
                        <div className="flex justify-between items-center font-bold text-slate-200">
                          <span>{s.name}</span>
                          <span className="font-mono text-cyan-300">{s.rate.toFixed(1)} fl/s</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center justify-between">
                          <span>來源: 攪拌機專線 (1:1)</span>
                          <span className="font-mono text-amber-400">{s.dedicatedPipes} 條專線</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    無廠內攪拌調配醬汁
                  </div>
                )}
              </div>

              <div className="mt-3 text-[11px] text-slate-500 bg-slate-950/50 p-2.5 rounded-xl border border-slate-850">
                💡 實體鐵律：多台攪拌機嚴禁合流為單管，必須各鋪設 1:1 專線直供需求端。
              </div>
            </div>

            {/* Quadrant 3 (中區二 H~L 欄): 轉化流體專屬抽取泵機與超頻階梯配置 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="font-bold text-slate-100 text-xs flex items-center space-x-1.5">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <span>【原位轉化流體抽取泵】</span>
                  </span>
                  <span className="text-[10px] text-slate-400">注入機專屬</span>
                </div>

                {result.fluids.transformations.length > 0 ? (
                  <div className="space-y-2">
                    {result.fluids.transformations.map((t, idx) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-purple-500/20 text-xs space-y-1.5">
                        <div className="flex justify-between items-center font-bold text-purple-200">
                          <span>{t.fluid} ({t.name})</span>
                          <span className="font-mono text-cyan-300">{t.demand.toFixed(1)} fl/s</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex justify-between">
                          <span>專屬抽取泵機:</span>
                          <span className="font-mono text-slate-200 font-bold">
                            {t.overclockPumps > 0 ? `${t.overclockPumps} 超頻泵 (8fl/s)` : `${t.regularPumps} 常規泵 (2fl/s)`}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1 text-slate-500">
                          <span>池中原位轉化</span>
                          <ArrowRight className="w-3 h-3 text-purple-400" />
                          <span className="text-purple-300">泵機抽取供液</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    本料理未涉及原位轉化
                  </div>
                )}
              </div>

              <div className="mt-3 text-[11px] text-slate-500 bg-slate-950/50 p-2.5 rounded-xl border border-slate-850">
                💡 原位轉化鐵律：轉化後之流體池必須在工序中配置專屬虛空泵機抽取，不計入外採常規管線。
              </div>
            </div>

            {/* Quadrant 4 (右區 M~Q 欄): 外採泵機流體與超頻階梯配置 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="font-bold text-slate-100 text-xs flex items-center space-x-1.5">
                    <Droplet className="w-4 h-4 text-cyan-400" />
                    <span>【外採流體智慧泵機組】</span>
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">自主判定超頻</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Water */}
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-slate-300 font-bold">外採水: </span>
                      <span className="font-mono text-cyan-300">{result.fluids.water.demand} fl/s</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {result.fluids.water.overclockPumps > 0 ? (
                        <span className="text-purple-400 font-bold">{result.fluids.water.overclockPumps} 超頻泵</span>
                      ) : result.fluids.water.regularPumps > 0 ? (
                        <span>{result.fluids.water.regularPumps} 常規泵</span>
                      ) : (
                        <span className="text-slate-600">0 泵</span>
                      )}
                    </div>
                  </div>

                  {/* Oil */}
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-slate-300 font-bold">外採油: </span>
                      <span className="font-mono text-amber-300">{result.fluids.oil.demand} fl/s</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {result.fluids.oil.overclockPumps > 0 ? (
                        <span className="text-purple-400 font-bold">{result.fluids.oil.overclockPumps} 超頻泵</span>
                      ) : result.fluids.oil.regularPumps > 0 ? (
                        <span>{result.fluids.oil.regularPumps} 常規泵</span>
                      ) : (
                        <span className="text-slate-600">0 泵</span>
                      )}
                    </div>
                  </div>

                  {/* Void */}
                  <div className="bg-slate-950 p-2 rounded-xl border border-purple-500/30 flex justify-between items-center">
                    <div>
                      <span className="text-purple-300 font-bold">外採虛空: </span>
                      <span className="font-mono text-purple-200">{result.fluids.voidFluid.demand} fl/s</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {result.fluids.voidFluid.overclockPumps > 0 ? (
                        <span className="text-purple-400 font-bold">{result.fluids.voidFluid.overclockPumps} 淨7超頻泵</span>
                      ) : result.fluids.voidFluid.regularPumps > 0 ? (
                        <span className="text-purple-300">{result.fluids.voidFluid.regularPumps} 常規泵</span>
                      ) : (
                        <span className="text-slate-600">0 泵</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total pumps & manipulators summary */}
              <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between items-center font-mono">
                <span>全廠泵機與操縱機總計:</span>
                <div className="text-right">
                  <span className="text-cyan-300 font-bold">
                    {result.fluids.totals.regularPumps} 常規泵 + {result.fluids.totals.overclockPumps} 超頻泵 + {result.fluids.totals.sludgeManipulators} 操縱機
                  </span>
                  {result.powerGrid.generatorSludgeManipulators > 0 && (
                    <span className="text-[10px] text-purple-400 block font-sans">
                      (含電廠 2:1:1 模組供汙泥操縱機 {result.powerGrid.generatorSludgeManipulators} 台)
                    </span>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Main Process Table (Rows 16+) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cog className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-200">
                  【產線工序設備清單 (動態展開)】
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                傳送帶固定速度 1 格/秒 · 吞吐無上限 · 自動廚師機 1:1:1:1
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs">
                    <th className="py-3 px-4">工序名稱</th>
                    <th className="py-3 px-4">使用設備</th>
                    <th className="py-3 px-4 text-right">單台基準速率</th>
                    <th className="py-3 px-4 text-right">需求流率</th>
                    <th className="py-3 px-4 text-right font-bold text-amber-300">實需台數</th>
                    <th className="py-3 px-4 text-center">最簡整數比</th>
                    <th className="py-3 px-4 text-right">電力 (FV/s)</th>
                    <th className="py-3 px-4 text-right">妖精</th>
                    <th className="py-3 px-4">分流拓撲與物理說明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {result.processes.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-100">
                        <span>{p.processName}</span>
                        {p.feederRole === 'donor' && p.feederNote && (
                          <span className="text-[11px] text-emerald-400 block font-normal mt-0.5">
                            ⚡ {p.feederNote}
                          </span>
                        )}
                        {p.feederRole === 'recipient' && p.feederNote && (
                          <span className="text-[11px] text-purple-300 block font-normal mt-0.5">
                            🌱 {p.feederNote}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-mono ${
                          p.machine === '物質操縱機'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : p.machine === '注入機'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}>
                          {p.machine}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {p.baseRateDisplay} <span className="text-xs text-slate-400">/s</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {p.countExact.toFixed(2)} 台
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-base font-bold text-amber-400">
                        {p.countRounded} 台
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-cyan-300">
                        {p.integerRatio}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {p.power.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {p.goblins}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className={`font-medium ${
                          p.topology.includes('大炮') ? 'text-amber-400' :
                          p.topology.includes('專線') ? 'text-cyan-300' :
                          p.topology.includes('重構') ? 'text-purple-300' :
                          p.topology.includes('轉化') ? 'text-indigo-300' : 'text-slate-400'
                        }`}>
                          {p.topology}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Explicit Feeder Harvesters Row (重構底料收割機實體展示) */}
                  {(result.baseFeeders.count > 0 || result.baseFeeders.offsetCount > 0) && (
                    <tr className={`border-t transition-colors ${
                      result.baseFeeders.count === 0
                        ? 'bg-emerald-950/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-purple-950/20 text-purple-300 border-purple-500/30'
                    }`}>
                      <td className="py-3 px-4 font-bold flex items-center space-x-1.5">
                        <Sprout className={`w-4 h-4 ${result.baseFeeders.count === 0 ? 'text-emerald-400' : 'text-purple-400'}`} />
                        <span>重構底料作物採集</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded border text-xs font-mono ${
                          result.baseFeeders.count === 0
                            ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-200'
                            : 'bg-purple-900/40 border-purple-500/40 text-purple-200'
                        }`}>
                          收割機 (底料專供)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono">0.20 /s</td>
                      <td className="py-3 px-4 text-right font-mono">{result.baseFeeders.count.toFixed(2)} 台</td>
                      <td className={`py-3 px-4 text-right font-mono font-bold text-base ${
                        result.baseFeeders.count === 0 ? 'text-emerald-400' : 'text-purple-300'
                      }`}>
                        {result.baseFeeders.count} 台
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-cyan-300">
                        {result.baseFeeders.count === 0 ? '-' : '1'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{result.baseFeeders.power.toFixed(1)}</td>
                      <td className="py-3 px-4 text-right font-mono">{result.baseFeeders.goblins}</td>
                      <td className="py-3 px-4 text-xs">
                        {result.baseFeeders.offsetCount > 0 ? (
                          <span className="text-emerald-300 font-medium">
                            {result.baseFeeders.count === 0 ? '🎉 ' : '⚡ '}
                            {result.baseFeeders.offsetSource || `已由產線過剩副產物折抵 ${result.baseFeeders.offsetCount} 台`}
                            {result.baseFeeders.count > 0 && `；剩餘 ${result.baseFeeders.count} 台需 1:1 直供專線`}
                            {' (需配置優先分流器防缺料)'}
                          </span>
                        ) : (
                          <span className="text-purple-300">
                            專線直供物質操縱機，每秒消耗 1 份作物底料完成異界質量重構 (1:1 防堵專線)
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="p-12 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
          查無該料理工序資料，請於資料工作台補充配方與工序。
        </div>
      )}
    </div>
  );
};
