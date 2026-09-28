import React, { useState, useMemo } from 'react';
import { calculateSingleDish } from '../../services/solver';
import { Recipe, FeederStrategy } from '../../types';
import { 
  Zap, Droplet, Users, Cog, ShieldAlert,
  Sprout, Sparkles, Flame
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
                      {r.name}
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

          {/* Station Cards: Fluid & Power Grid (與多料理並聯保持高度一致的 2 欄寬幅控制站) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Left Card: 全廠流體供應站 (自主超頻智慧階梯) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
                  <Droplet className="w-4 h-4 text-cyan-400" />
                  <span>全廠流體供應站 (自主超頻智慧階梯)</span>
                </h3>
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded whitespace-nowrap">
                  {result.fluids.voidFluid.demand > 0 ? '全廠有虛空 (門檻 > 2 fl/s)' : '全廠無虛空 (門檻 > 6 fl/s)'}
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
                      需量：<span className="font-mono text-cyan-300 font-bold">{result.fluids.water.demand}</span> fl/s
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-slate-200 font-bold whitespace-nowrap">
                      {result.fluids.water.overclockPumps > 0 && (
                        <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1 whitespace-nowrap inline-block">
                          超頻泵 {result.fluids.water.overclockPumps} 台
                        </span>
                      )}
                      {result.fluids.water.regularPumps > 0 && (
                        <span className="px-1.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded whitespace-nowrap inline-block">
                          常規泵 {result.fluids.water.regularPumps} 台
                        </span>
                      )}
                      {result.fluids.water.overclockPumps === 0 && result.fluids.water.regularPumps === 0 && (
                        <span className="text-slate-500 whitespace-nowrap">無需外採</span>
                      )}
                    </div>
                    {result.fluids.water.sludgeManipulators > 0 && (
                      <div className="text-[11px] text-purple-400 mt-1 whitespace-nowrap">
                        附帶汙泥操縱機：{result.fluids.water.sludgeManipulators} 台
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
                      需量：<span className="font-mono text-amber-300 font-bold">{result.fluids.oil.demand}</span> fl/s
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-slate-200 font-bold whitespace-nowrap">
                      {result.fluids.oil.overclockPumps > 0 && (
                        <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1 whitespace-nowrap inline-block">
                          超頻泵 {result.fluids.oil.overclockPumps} 台
                        </span>
                      )}
                      {result.fluids.oil.regularPumps > 0 && (
                        <span className="px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded whitespace-nowrap inline-block">
                          常規泵 {result.fluids.oil.regularPumps} 台
                        </span>
                      )}
                      {result.fluids.oil.overclockPumps === 0 && result.fluids.oil.regularPumps === 0 && (
                        <span className="text-slate-500 whitespace-nowrap">無需外採</span>
                      )}
                    </div>
                    {result.fluids.oil.sludgeManipulators > 0 && (
                      <div className="text-[11px] text-purple-400 mt-1 whitespace-nowrap">
                        附帶汙泥操縱機：{result.fluids.oil.sludgeManipulators} 台
                      </div>
                    )}
                  </div>
                </div>

                {/* In-situ Transformations */}
                {result.fluids.transformations.length > 0 && (
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
                    <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                      <span>原位轉化專屬抽取泵機</span>
                    </div>
                    {result.fluids.transformations.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] border-t border-slate-800 pt-1.5">
                        <span className="text-slate-300 whitespace-nowrap">{t.name} ({t.fluid})</span>
                        <span className="font-mono text-slate-200 font-bold whitespace-nowrap">
                          {t.overclockPumps > 0 ? `超頻泵 ${t.overclockPumps} 台` : `常規泵 ${t.regularPumps} 台`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}


                {/* Void Fluid */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-200 flex items-center space-x-1.5 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                      <span>全廠虛空流體總需量</span>
                    </div>
                    <div className="text-slate-400 mt-0.5 whitespace-nowrap">
                      總閉環需量：<span className="font-mono text-purple-300 font-bold">{result.fluids.voidFluid.demand}</span> fl/s
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                      工藝: {result.fluids.voidFluid.breakdown.processVoid} | 泵自耗: {result.fluids.voidFluid.breakdown.pumpSludgeVoid} | 發電自耗: {result.fluids.voidFluid.breakdown.generatorSludgeVoid}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-slate-200 font-bold whitespace-nowrap">
                      {result.fluids.voidFluid.overclockPumps > 0 && (
                        <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded mr-1 whitespace-nowrap inline-block">
                          淨7超頻泵 {result.fluids.voidFluid.overclockPumps} 台
                        </span>
                      )}
                      {result.fluids.voidFluid.regularPumps > 0 && (
                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded whitespace-nowrap inline-block">
                          常規泵 {result.fluids.voidFluid.regularPumps} 台
                        </span>
                      )}
                      {result.fluids.voidFluid.overclockPumps === 0 && result.fluids.voidFluid.regularPumps === 0 && (
                        <span className="text-slate-500 whitespace-nowrap">無需外採</span>
                      )}
                    </div>
                    {result.fluids.voidFluid.sludgeManipulators > 0 && (
                      <div className="text-[11px] text-purple-400 mt-1 whitespace-nowrap">
                        附帶汙泥操縱機：{result.fluids.voidFluid.sludgeManipulators} 台
                      </div>
                    )}
                  </div>
                </div>

                {/* Total pumps & manipulators summary */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <div className="text-slate-300 font-bold whitespace-nowrap flex items-center justify-between">
                    <span>全廠泵機與操縱機總計:</span>
                    <span className="text-cyan-300 font-mono font-bold whitespace-nowrap">
                      {result.fluids.totals.regularPumps} 常規泵 + {result.fluids.totals.overclockPumps} 超頻泵 + {result.fluids.totals.sludgeManipulators} 操縱機
                    </span>
                  </div>
                  {result.powerGrid.generatorSludgeManipulators > 0 && (
                    <div className="text-[10px] text-purple-400 font-sans whitespace-nowrap text-right">
                      (含電廠 2:1:1 模組供汙泥操縱機 {result.powerGrid.generatorSludgeManipulators} 台)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Card: 全廠電網負載與小妖精總結算 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>全廠電網負載與小妖精總結算</span>
                </h3>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                    實需主設備: <strong className="text-cyan-300 font-bold">{result.totalMachineCount}</strong> 台
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
                      {result.powerGrid.furnaces} 熔爐 : {result.powerGrid.coalMiners} 採煤機
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] border-t border-slate-800 pt-2">
                    <div className="whitespace-nowrap">淨發電總量：<span className="font-mono text-amber-300 font-bold">{result.powerGrid.netPower} FV/s</span></div>
                    <div className="whitespace-nowrap">電網盈餘：<span className="font-mono text-emerald-400 font-bold">+{result.powerGrid.surplusPower} FV/s</span></div>
                    <div className="whitespace-nowrap">煤炭消耗率：<span className="font-mono text-slate-200 font-bold">{result.powerGrid.coalRate} 塊/秒</span></div>
                    {powerMode === 'overclock' && (
                      <div className="whitespace-nowrap">汙泥操縱機：<span className="font-mono text-purple-300 font-bold">{result.powerGrid.generatorSludgeManipulators} 台</span></div>
                    )}
                  </div>
                </div>

                {/* Vertical Cumulative Power Load Breakdown */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-[11px]">
                  <div className="font-bold text-slate-300 mb-1 whitespace-nowrap">電網垂直累加負載</div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="whitespace-nowrap">1. 主要生產設備負載：</span>
                    <span className="font-mono text-slate-200 font-bold whitespace-nowrap">{result.powerGrid.mainEquipmentPower.toFixed(1)} FV/s</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="whitespace-nowrap">2. 流體泵機與操縱機自耗：</span>
                    <span className="font-mono text-slate-200 font-bold whitespace-nowrap">{result.powerGrid.pumpManipulatorPower.toFixed(1)} FV/s</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="whitespace-nowrap">3. 重構底料作物收割機：</span>
                    <div className="flex items-center space-x-1.5 whitespace-nowrap">
                      {result.baseFeeders.offsetCount > 0 && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-bold">
                          折抵 {result.baseFeeders.offsetCount} 台
                        </span>
                      )}
                      <span className="font-mono text-slate-200 font-bold">{result.powerGrid.baseFeederPower.toFixed(1)} FV/s</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="whitespace-nowrap">4. 採煤機運行負載：</span>
                    <span className="font-mono text-slate-200 font-bold whitespace-nowrap">{result.powerGrid.coalMinerPower.toFixed(1)} FV/s</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-800 pt-1 font-bold text-amber-400">
                    <span className="whitespace-nowrap">全廠實時總負載：</span>
                    <span className="font-mono whitespace-nowrap">{result.powerGrid.totalLoad.toFixed(1)} FV/s</span>
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
                      {result.goblinsBreakdown.total}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">名</span>
                  </div>
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
                    <th className="py-3 px-4 whitespace-nowrap">工序名稱</th>
                    <th className="py-3 px-4 whitespace-nowrap">使用設備</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">單台基準速率</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">需求流率</th>
                    <th className="py-3 px-4 text-right font-bold text-amber-300 whitespace-nowrap">實需台數</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap">最簡整數比</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">電力 (FV/s)</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">妖精</th>
                    <th className="py-3 px-4 min-w-[240px]">分流拓撲與物理說明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {result.processes.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-100">
                        <span>{p.processName}</span>
                        {p.feederRole === 'donor' && p.feederNote && (
                          <span className="text-[11px] text-emerald-400 block font-normal mt-0.5 whitespace-nowrap">
                            ⚡ {p.feederNote}
                          </span>
                        )}
                        {p.feederRole === 'recipient' && p.feederNote && (
                          <span className="text-[11px] text-purple-300 block font-normal mt-0.5 whitespace-nowrap">
                            🌱 {p.feederNote}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${
                          p.machine === '物質操縱機'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : p.machine === '注入機'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}>
                          {p.machine}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                        {p.baseRateDisplay} <span className="text-xs text-slate-400">/s</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                        {p.countExact.toFixed(2)} 台
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-base font-bold text-amber-400 whitespace-nowrap">
                        {p.countRounded} 台
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {p.integerRatio}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                        {p.power.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
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
                      <td className="py-3 px-4 font-bold flex items-center space-x-1.5 whitespace-nowrap">
                        <Sprout className={`w-4 h-4 shrink-0 ${result.baseFeeders.count === 0 ? 'text-emerald-400' : 'text-purple-400'}`} />
                        <span>重構底料作物採集</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded border text-xs font-mono whitespace-nowrap inline-block ${
                          result.baseFeeders.count === 0
                            ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-200'
                            : 'bg-purple-900/40 border-purple-500/40 text-purple-200'
                        }`}>
                          收割機 (底料專供)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap">0.20 /s</td>
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap">{result.baseFeeders.count.toFixed(2)} 台</td>
                      <td className={`py-3 px-4 text-right font-mono font-bold text-base whitespace-nowrap ${
                        result.baseFeeders.count === 0 ? 'text-emerald-400' : 'text-purple-300'
                      }`}>
                        {result.baseFeeders.count} 台
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {result.baseFeeders.count === 0 ? '-' : '1'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap">{result.baseFeeders.power.toFixed(1)}</td>
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap">{result.baseFeeders.goblins}</td>
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
