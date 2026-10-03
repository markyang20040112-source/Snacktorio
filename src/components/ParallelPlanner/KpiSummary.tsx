import React from 'react';
import { ConsolidatedPlan } from '../../services/parallelPlanner';

/** 表格下方效益總結 KPI 卡片。 */
export const KpiSummary: React.FC<{ consolidated: ConsolidatedPlan }> = ({ consolidated }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {consolidated.isSingleDish ? (
      <>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 mb-1">生產設備實需</div>
          <div className="text-2xl font-bold text-cyan-300 font-mono">
            {consolidated.totalParallel} <span className="text-sm font-normal text-slate-400">台</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">全製程主加工與採集設備</div>
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

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 mb-1">總勞動哥布林配置</div>
          <div className="text-2xl font-bold text-emerald-300 font-mono">
            {consolidated.totalPlantGoblins} <span className="text-sm font-normal text-slate-400">隻</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">含主機、泵站與熔爐人力</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 mb-1">公用泵站抽水抽油</div>
          <div className="text-2xl font-bold text-cyan-300 font-mono">
            {consolidated.totalPlantRegularPumps + consolidated.totalPlantOverclockPumps} <span className="text-sm font-normal text-slate-400">台泵</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            外採水/油/轉化流體專線
          </div>
        </div>
      </>
    ) : (
      <>
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

        <div className="bg-[#102922] border border-emerald-500/40 rounded-2xl p-4 shadow-lg shadow-emerald-950/20">
          <div className="text-xs text-emerald-400 mb-1 font-bold">🎉 為全廠節省設備</div>
          <div className="text-2xl font-bold text-emerald-300 font-mono">
            +{consolidated.totalSavedMachines} <span className="text-sm font-normal text-emerald-400">台</span>
          </div>
          <div className="text-xs text-emerald-400/80 mt-1">大幅壓縮佔地與管線複雜度</div>
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
      </>
    )}
  </div>
);
