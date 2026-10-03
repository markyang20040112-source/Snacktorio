import React from 'react';
import { ConsolidatedPlan } from '../../services/parallelPlanner';
import { Zap, Flame, Users } from 'lucide-react';

/** 全廠電網負載與小妖精總結算。 */
export const PowerStation: React.FC<{ consolidated: ConsolidatedPlan; powerMode: 'regular' | 'overclock' }> = ({ consolidated, powerMode }) => (
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
);
