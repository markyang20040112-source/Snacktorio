import React, { useState, useMemo } from 'react';
import { calculateSingleDish } from '../../services/solver';
import { Recipe } from '../../types';
import { 
  Zap, Droplet, Users, Cog, Flame, ShieldAlert
} from 'lucide-react';

interface SingleCalculatorProps {
  recipes: Recipe[];
}

export const SingleCalculator: React.FC<SingleCalculatorProps> = ({ recipes }) => {
  const [selectedDish, setSelectedDish] = useState<string>(recipes[0]?.name || '哀嚎肉丸');
  const [targetRate, setTargetRate] = useState<number>(0.2); // dishes/s
  const [rateUnit, setRateUnit] = useState<'sec' | 'min'>('sec');
  const [powerMode, setPowerMode] = useState<'regular' | 'overclock'>('regular');

  // Rate in dishes/s
  const actualRateSec = rateUnit === 'min' ? targetRate / 60 : targetRate;

  // Calculation Result
  const result = useMemo(() => {
    return calculateSingleDish(selectedDish, actualRateSec, powerMode);
  }, [selectedDish, actualRateSec, powerMode]);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
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
        </div>
      </div>

      {result ? (
        <>
          {/* KPI Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>實需主設備總數</span>
                <Cog className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-slate-100 font-mono">
                {result.totalMachineCount} <span className="text-sm font-normal text-slate-400">台</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                含收割、研磨、攪拌、廚師機等
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>總電力負載</span>
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold text-cyan-300 font-mono">
                {result.totalPower.toFixed(1)} <span className="text-sm font-normal text-slate-400">FV/s</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                需 {result.powerSupply.furnaces} 熔爐 : {result.powerSupply.coalMiners} 採煤機
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>外採泵機流體</span>
                <Droplet className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-sm font-bold text-slate-200 mt-1 space-y-0.5 font-mono">
                <div>水: {result.fluids.water.demand} fl/s ({result.fluids.water.regularPumps + result.fluids.water.overclockPumps} 泵)</div>
                <div>油: {result.fluids.oil.demand} fl/s ({result.fluids.oil.regularPumps + result.fluids.oil.overclockPumps} 泵)</div>
                <div>虛空: {result.fluids.voidFluid.demand} fl/s ({result.fluids.voidFluid.regularPumps + result.fluids.voidFluid.overclockPumps} 泵)</div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>打工小妖精資本</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-300 font-mono">
                {result.totalGoblins} <span className="text-sm font-normal text-slate-400">個</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                固定建造佔地 1x1
              </div>
            </div>
          </div>

          {/* Biochemical Warnings */}
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

          {/* Main Process Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cog className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-200">
                  動態工序平衡展開表（零停機、零溢流推導）
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                傳送帶固定速度 1 格/秒，吞吐無上限
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs">
                    <th className="py-3 px-4">工序 / 產出項目</th>
                    <th className="py-3 px-4">使用設備</th>
                    <th className="py-3 px-4 text-right">單台基準速率</th>
                    <th className="py-3 px-4 text-right">需求流率</th>
                    <th className="py-3 px-4 text-right font-bold text-amber-300">實需台數</th>
                    <th className="py-3 px-4 text-center">最簡整數比</th>
                    <th className="py-3 px-4 text-right">電力 (FV/s)</th>
                    <th className="py-3 px-4 text-right">妖精</th>
                    <th className="py-3 px-4">佈線拓撲與特殊說明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {result.processes.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-100 flex items-center space-x-1.5">
                        <span>{p.processName}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono">
                          {p.machine}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {p.baseRateDisplay} <span className="text-xs text-slate-400">份/秒</span>
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
                        {p.warnings.length > 0 ? (
                          <div className="space-y-1">
                            {p.warnings.map((w, wIdx) => (
                              <span key={wIdx} className="inline-block bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                                {w}
                              </span>
                            ))}
                          </div>
                        ) : p.integerRatio === 1 ? (
                          <span className="text-slate-400">1:1 直連輸送帶</span>
                        ) : (
                          <span className="text-cyan-400">專用分流器 (Splitter) 比例分配</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deep-Dive Grid: Fluids and Power */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fluids Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold">
                <Droplet className="w-5 h-5" />
                <h3>連續流體管網與泵機配置 (fl/s)</h3>
              </div>

              {/* Sauces 1:1 dedicated pipes */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-amber-400 flex items-center justify-between">
                  <span>廠內調配醬汁（1:1 獨立專線直連）</span>
                  <span>嚴禁合流</span>
                </div>
                {result.fluids.sauces.length > 0 ? (
                  result.fluids.sauces.map((s, sIdx) => (
                    <div key={sIdx} className="flex items-center justify-between text-xs py-1 border-b border-slate-850 last:border-0">
                      <span className="text-slate-300">{s.name}</span>
                      <span className="font-mono text-cyan-300">
                        {s.dedicatedPipes} 條獨立專線 ({s.rate.toFixed(1)} fl/s)
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400">本料理無廠內攪拌醬汁</div>
                )}
              </div>

              {/* External Fluids */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-slate-300 mb-1">外採流體階梯配置（智慧泵機組）</div>
                
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">外採水需量：</span>
                  <span className="font-mono font-bold text-slate-200">
                    {result.fluids.water.demand} fl/s 
                    <span className="text-slate-400 font-normal ml-2">
                      ({result.fluids.water.regularPumps} 常規泵 / {result.fluids.water.overclockPumps} 超頻泵)
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">外採油需量：</span>
                  <span className="font-mono font-bold text-slate-200">
                    {result.fluids.oil.demand} fl/s 
                    <span className="text-slate-400 font-normal ml-2">
                      ({result.fluids.oil.regularPumps} 常規泵 / {result.fluids.oil.overclockPumps} 超頻泵)
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">外採虛空需量：</span>
                  <span className="font-mono font-bold text-purple-300">
                    {result.fluids.voidFluid.demand} fl/s 
                    <span className="text-slate-400 font-normal ml-2">
                      ({result.fluids.voidFluid.regularPumps} 常規泵 / {result.fluids.voidFluid.overclockPumps} 超頻淨7泵)
                    </span>
                  </span>
                </div>

                {result.fluids.voidFluid.sludgeSelfLoss > 0 && (
                  <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300 mt-2">
                    🔄 閉環自耗回算：啟用超頻泵機，供汙泥操機額外自耗虛空 {result.fluids.voidFluid.sludgeSelfLoss.toFixed(1)} fl/s（已計入總需量）。
                  </div>
                )}
              </div>
            </div>

            {/* Power & Generator Balance */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-2 text-amber-400 font-bold">
                <Flame className="w-5 h-5" />
                <h3>即時電網平衡與發電熔爐 2:1 配置</h3>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">運作模式：</span>
                  <span className="font-bold text-amber-300">
                    {powerMode === 'regular' ? '常規模式 (4 FV/s 淨 3.5 FV/s)' : '超頻模式 (16 FV/s 2:1:1 閉環模組)'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">發電熔爐需量：</span>
                  <span className="font-mono font-bold text-slate-100 text-sm">
                    {result.powerSupply.furnaces} 台
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">採煤機配比 (2:1 平衡)：</span>
                  <span className="font-mono font-bold text-slate-100 text-sm">
                    {result.powerSupply.coalMiners} 台 (耗煤 {result.powerSupply.coalRate} 個/秒)
                  </span>
                </div>

                {powerMode === 'overclock' && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">供汙泥操機 (2:1:1 模組)：</span>
                    <span className="font-mono font-bold text-purple-300 text-sm">
                      {result.powerSupply.sludgeManipulators} 台 (空載凝結免底料)
                    </span>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-mono">
                  <span className="text-slate-400">電網淨發電 / 盈餘：</span>
                  <span className="text-emerald-400 font-bold">
                    淨發電 {result.powerSupply.netFV} FV/s (盈餘 +{result.powerSupply.surplusFV} FV/s)
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-400 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                💡 物理守恆原則：電力採即時連續流平衡，無蓄電池緩衝。採煤機與供汙泥操機自身能耗已 100% 於系統內閉環結算。
              </div>
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
