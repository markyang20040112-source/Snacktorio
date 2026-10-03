import React from 'react';
import { ConsolidatedPlan } from '../../services/parallelPlanner';
import { Droplets } from 'lucide-react';

/** 全廠公用流體泵站（水/油/原位轉化/虛空 自主超頻階梯）。 */
export const FluidStation: React.FC<{ consolidated: ConsolidatedPlan }> = ({ consolidated }) => (
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
);
