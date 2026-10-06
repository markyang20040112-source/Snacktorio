import React from 'react';
import { Zap, Users, Droplets, Sparkles } from 'lucide-react';
import { SandboxMetrics } from './sandboxTypes';

/** 右側即時物理監控儀表板 (電網、小妖精、流體盈虧、出餐效率) */
export const SandboxMetricsPanel: React.FC<{ metrics: SandboxMetrics }> = ({ metrics }) => {
  return (
    <div className="w-80 border-l border-[#1c2e38] bg-[#0b1419]/95 backdrop-blur-xl flex flex-col z-20">
      <div className="p-3.5 border-b border-[#1c2e38] flex items-center justify-between">
        <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>全廠即時物理監控</span>
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#14232a] text-teal-300 border border-teal-500/30">
          {metrics.machineCount} 台機
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        
        {/* (1) 即時電網監控 */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-300 flex items-center space-x-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>即時連續電網</span>
            </span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
              metrics.powerBalance >= 0 
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' 
                : 'bg-rose-950 text-rose-300 border border-rose-800/60'
            }`}>
              {metrics.powerBalance >= 0 ? '電網穩定' : '⚠️ 嚴重跳電'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-[#121c22] p-2 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400">總發電量</div>
              <div className="text-base font-bold text-amber-300">+{metrics.totalPowerGen} <span className="text-[10px] font-normal text-slate-500">FV/s</span></div>
            </div>
            <div className="bg-[#121c22] p-2 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400">總負載</div>
              <div className="text-base font-bold text-slate-200">{metrics.totalPowerLoad} <span className="text-[10px] font-normal text-slate-500">FV/s</span></div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60">
            <span className="text-slate-400">電網淨盈餘</span>
            <span className={`font-mono font-bold ${metrics.powerBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {metrics.powerBalance > 0 ? `+${metrics.powerBalance}` : metrics.powerBalance} FV/s
            </span>
          </div>
        </div>

        {/* (2) 小妖精勞動力 */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-teal-400" />
            <div>
              <div className="font-bold text-slate-300">打工小妖精需求</div>
              <div className="text-[10px] text-slate-500">全廠運作所需妖精總額</div>
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-teal-300">
            {metrics.totalGoblins} <span className="text-xs font-normal text-slate-400">隻</span>
          </div>
        </div>

        {/* (3) 連續流體平衡 */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="font-bold text-slate-300 flex items-center space-x-1">
            <Droplets className="w-3.5 h-3.5 text-cyan-400" />
            <span>全廠連續流體產銷</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            {/* 水 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">供水 (fl/s)</span>
              <span className="font-mono text-slate-200">
                <span className="text-cyan-400">{metrics.fluidsSummary.water.produced.toFixed(1)}</span>
                <span className="text-slate-600"> / </span>
                <span className="text-slate-400">{metrics.fluidsSummary.water.consumed.toFixed(1)} 需</span>
              </span>
            </div>
            {/* 油 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">供油 (fl/s)</span>
              <span className="font-mono text-slate-200">
                <span className="text-amber-400">{metrics.fluidsSummary.oil.produced.toFixed(1)}</span>
                <span className="text-slate-600"> / </span>
                <span className="text-slate-400">{metrics.fluidsSummary.oil.consumed.toFixed(1)} 需</span>
              </span>
            </div>
            {/* 虛空 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">虛空流體</span>
              <span className="font-mono text-slate-200">
                <span className="text-purple-400">{metrics.fluidsSummary.void.produced.toFixed(1)}</span>
                <span className="text-slate-600"> / </span>
                <span className="text-slate-400">{metrics.fluidsSummary.void.consumed.toFixed(1)} 需</span>
              </span>
            </div>
            {/* 衍生流體 (如炙烈紅油, 醋) */}
            {Object.entries(metrics.fluidsSummary.custom).map(([fName, val]) => (
              <div key={fName} className="flex items-center justify-between">
                <span className="text-rose-300">{fName}</span>
                <span className="font-mono text-slate-200">
                  <span className="text-rose-400">{val.produced.toFixed(1)}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-slate-400">{val.consumed.toFixed(1)} 需</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* (4) 終端料理出餐檢測 */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="font-bold text-slate-300 flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>終端料理出餐統計</span>
          </div>

          {metrics.terminalDishes.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic py-1 text-center">
              尚未放置自動廚師機
            </div>
          ) : (
            metrics.terminalDishes.map((dish, i) => (
              <div key={i} className="p-2 rounded-xl bg-[#121c22] border border-slate-800 flex items-center justify-between">
                <div className="truncate">
                  <div className="font-bold text-slate-200 truncate">{dish.dishName}</div>
                  <div className="text-[10px] text-slate-400">稼動率 {dish.efficiency}%</div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className="font-bold text-amber-300">{dish.ratePerMin}</div>
                  <div className="text-[9px] text-slate-500">份 / 分</div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
