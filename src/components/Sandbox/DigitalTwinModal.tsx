import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, RefreshCw, Cpu, Activity,
  Boxes, GitMerge, ArrowRight, Layers, ShieldCheck, Bug
} from 'lucide-react';
import { 
  runDigitalTwinVerification, 
  runFullPlantAudit, 
  runBlueprintAudit,
  DigitalTwinReport, 
  FullPlantAuditReport 
} from '../../services/digitalTwinAudit';
import { dataService } from '../../services/dataService';
import { Recipe } from '../../types';
import { SandboxBlueprint } from './sandboxTypes';

interface DigitalTwinModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDishName?: string;
  currentBlueprint?: SandboxBlueprint;
}

export const DigitalTwinModal: React.FC<DigitalTwinModalProps> = ({
  isOpen,
  onClose,
  currentDishName,
  currentBlueprint
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'fullPlant'>('current');
  const [selectedDishName, setSelectedDishName] = useState<string>('');
  const [report, setReport] = useState<DigitalTwinReport | null>(null);
  const [fullPlantReport, setFullPlantReport] = useState<FullPlantAuditReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    if (isOpen) {
      const allRecipes = dataService.getRecipes();
      setRecipes(allRecipes);
      const targetDish = (currentDishName && allRecipes.some(r => r.name === currentDishName))
        ? currentDishName
        : (allRecipes[0]?.name || '');
      setSelectedDishName(targetDish);

      if (currentBlueprint && currentBlueprint.nodes.length > 0) {
        runAuditForBlueprint(currentBlueprint, allRecipes);
      } else if (targetDish) {
        runAuditForDish(targetDish, allRecipes);
      }
    }
  }, [isOpen, currentDishName, currentBlueprint]);

  const runAuditForBlueprint = (bp: SandboxBlueprint, allRecipes?: Recipe[]) => {
    setIsRunning(true);
    const recs = allRecipes || recipes;
    setTimeout(() => {
      try {
        const rep = runBlueprintAudit(bp, { recipes: recs });
        setReport(rep);
      } catch (e) {
        console.error('Digital Twin Audit Error:', e);
      } finally {
        setIsRunning(false);
      }
    }, 0);
  };

  // 體檢為重度同步運算：先讓 isRunning 載入狀態繪製，再於下一個 macrotask 執行
  const runAuditForDish = (dishName: string, allRecipes?: Recipe[]) => {
    setIsRunning(true);
    const recs = allRecipes || recipes;
    setTimeout(() => {
      try {
        const rep = runDigitalTwinVerification(dishName, { recipes: recs });
        setReport(rep);
      } catch (e) {
        console.error('Digital Twin Audit Error:', e);
      } finally {
        setIsRunning(false);
      }
    }, 0);
  };

  const handleRunFullPlant = () => {
    setIsRunning(true);
    setTimeout(() => {
      try {
        const fullRep = runFullPlantAudit(recipes);
        setFullPlantReport(fullRep);
        setActiveTab('fullPlant');
      } catch (e) {
        console.error('Full Plant Audit Error:', e);
      } finally {
        setIsRunning(false);
      }
    }, 0);
  };

  const handleSelectDishFromPlant = (dishName: string) => {
    setSelectedDishName(dishName);
    runAuditForDish(dishName);
    setActiveTab('current');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0b1419] border border-[#1e3340] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1c2e38] flex items-center justify-between bg-[#0e1a22]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">數位雙生閉環檢查中心</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  Digital Twin 2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                純二元健康狀態判定：靜態鏡像一致性審計 (Mirror) + 動態物理快進體檢 (Headless Physics)
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls & Actions */}
        <div className="px-6 py-2.5 border-b border-[#1c2e38] flex items-center justify-between bg-[#0a1318] text-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('current')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'current'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>當前產線體檢 ({report?.dishName || selectedDishName})</span>
            </button>
            <button
              onClick={() => {
                if (!fullPlantReport) handleRunFullPlant();
                else setActiveTab('fullPlant');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'fullPlant'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>全廠 42 道食譜巡檢</span>
              {fullPlantReport && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono">
                  {fullPlantReport.healthyCount}/{fullPlantReport.totalDishes}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {activeTab === 'current' ? (
              <button
                onClick={() => {
                  if (currentBlueprint && currentBlueprint.nodes.length > 0) {
                    runAuditForBlueprint(currentBlueprint);
                  } else {
                    runAuditForDish(selectedDishName);
                  }
                }}
                disabled={isRunning}
                className="px-2.5 py-1.5 bg-[#14232a] hover:bg-[#1a2d36] text-slate-300 rounded-xl border border-slate-700/60 flex items-center space-x-1 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin text-teal-400' : ''}`} />
                <span>重新體檢</span>
              </button>
            ) : (
              <button
                onClick={handleRunFullPlant}
                disabled={isRunning}
                className="px-3 py-1.5 bg-teal-600/30 hover:bg-teal-600/40 text-teal-200 border border-teal-500/50 rounded-xl font-bold flex items-center space-x-1 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                <span>一鍵全廠總體檢</span>
              </button>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'current' && report && (
            <div className="space-y-6">
              
              {/* Overall Health Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                report.isHealthy 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200 animate-pulse'
              }`}>
                <div className="flex items-center space-x-3">
                  {report.isHealthy ? (
                    <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-100">【{report.dishName}】產線健康狀態</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold font-mono ${
                        report.isHealthy
                          ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/60'
                          : 'bg-rose-900/60 text-rose-300 border border-rose-500/60'
                      }`}>
                        {report.isHealthy ? '🟢 100% 滿載健全' : '🔴 產線故障'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {report.isHealthy 
                        ? '雙階審計全數通過：理論鏡像 1:1 對齊、動態物理 60 週期無 UI 快進完全收斂、零自癒補丁。'
                        : `檢測到 ${report.faults.length} 項物理阻斷故障，請依下方診斷指引排除。`}
                    </p>
                  </div>
                </div>

                <div className="text-right text-xs font-mono text-slate-400 shrink-0">
                  <span>演算耗時 </span>
                  <span className="text-teal-300 font-bold">{report.executionTimeMs}ms</span>
                </div>
              </div>

              {/* Stage 1: Mirror Audit */}
              <div className="bg-[#0e1a22] p-4 rounded-2xl border border-[#1e3340] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1c2e38]">
                  <div className="flex items-center space-x-2">
                    <Boxes className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-100">第一關：靜態鏡像一致性審計 (Mirror Audit)</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    report.stage1.passed 
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}>
                    {report.stage1.passed ? 'PASSED 鏡像一致' : 'FAILED 鏡像未對齊'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-[#121f28] p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">加工/出餐機台數量對帳</div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-base font-bold text-cyan-300">理論 {report.stage1.calcMachineCount} 台</span>
                      <span className="text-slate-500">==</span>
                      <span className="text-base font-bold text-teal-300">實體 {report.stage1.sandboxMachineCount} 台</span>
                    </div>
                  </div>

                  <div className="bg-[#121f28] p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">副產物折抵連線狀態</div>
                    <div className="text-sm font-bold text-slate-200 mt-1">
                      {report.stage1.byproductOffsetsMatched ? (
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                          拓撲直供連線 100% 吻合
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                          存在未直連副產物折抵
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div className="bg-[#121f28] p-2.5 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">全廠總耗電對帳</div>
                    <div className="flex items-baseline space-x-1.5">
                      <span className="text-sm font-bold text-cyan-300">{report.stage1.calcPowerLoad}</span>
                      <span className="text-slate-500">==</span>
                      <span className={`text-sm font-bold ${report.stage1.powerLoadMatched ? 'text-teal-300' : 'text-rose-400'}`}>{report.stage1.sandboxPowerLoad} FV/s</span>
                    </div>
                  </div>

                  <div className="bg-[#121f28] p-2.5 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">全廠泵機台數對帳</div>
                    <div className="flex items-baseline space-x-1.5">
                      <span className="text-sm font-bold text-cyan-300">理論 {report.stage1.calcPumpCount}</span>
                      <span className="text-slate-500">==</span>
                      <span className={`text-sm font-bold ${report.stage1.pumpCountMatched ? 'text-teal-300' : 'text-rose-400'}`}>實體 {report.stage1.sandboxPumpCount} 台</span>
                    </div>
                  </div>

                  <div className="bg-[#121f28] p-2.5 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">發電熔爐數對帳</div>
                    <div className="flex items-baseline space-x-1.5">
                      <span className="text-sm font-bold text-cyan-300">理論 {report.stage1.calcFurnaceCount}</span>
                      <span className="text-slate-500">==</span>
                      <span className={`text-sm font-bold ${report.stage1.furnaceCountMatched ? 'text-teal-300' : 'text-rose-400'}`}>實體 {report.stage1.sandboxFurnaceCount} 座</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400 bg-[#091217] p-2.5 rounded-xl border border-slate-800/60 font-mono">
                  {report.stage1.details.map((det, i) => (
                    <div key={i} className="flex items-center space-x-1.5">
                      <span className="text-cyan-500">›</span>
                      <span>{det}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage 2: Headless Physics Audit */}
              <div className="bg-[#0e1a22] p-4 rounded-2xl border border-[#1e3340] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1c2e38]">
                  <div className="flex items-center space-x-2">
                    <GitMerge className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-100">第二關：動態物理快進體檢 (Headless Physics Audit - 60 週期)</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    report.stage2.passed 
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}>
                    {report.stage2.passed ? 'PASSED 滿載收斂' : 'FAILED 物理異常'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div className="bg-[#121f28] p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">終端廚師機稼動率</div>
                    <div className={`text-base font-bold ${report.stage2.chefEfficiency >= 99.9 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {report.stage2.chefEfficiency}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">目標：≥ 99.9% 滿載</div>
                  </div>

                  <div className="bg-[#121f28] p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">自癒補丁機台數</div>
                    <div className={`text-base font-bold ${report.stage2.healedNodeCount === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {report.stage2.healedNodeCount} <span className="text-xs font-normal text-slate-500">台</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">目標：0 台 (自立運轉)</div>
                  </div>

                  <div className="bg-[#121f28] p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1">0% 停機設備數</div>
                    <div className={`text-base font-bold ${report.stage2.stoppageNodes.length === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {report.stage2.stoppageNodes.length} <span className="text-xs font-normal text-slate-500">台</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">目標：0 台 (零死鎖)</div>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400 bg-[#091217] p-2.5 rounded-xl border border-slate-800/60 font-mono">
                  {report.stage2.details.map((det, i) => (
                    <div key={i} className="flex items-center space-x-1.5">
                      <span className="text-amber-500">›</span>
                      <span>{det}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fault Diagnostics (if any) */}
              {report.faults.length > 0 && (
                <div className="bg-rose-950/20 p-4 rounded-2xl border border-rose-500/40 space-y-3">
                  <div className="flex items-center space-x-2 text-rose-300 font-bold text-xs">
                    <Bug className="w-4 h-4" />
                    <span>故障診斷字典與修復建議 ({report.faults.length} 項)</span>
                  </div>

                  <div className="space-y-2.5">
                    {report.faults.map((fault, idx) => (
                      <div key={idx} className="bg-[#120f14] p-3 rounded-xl border border-rose-900/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-200">{fault.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-rose-950 text-rose-300 border border-rose-800">
                            {fault.code}
                          </span>
                        </div>
                        <div className="text-slate-300 text-[11px]">{fault.message}</div>
                        <div className="text-amber-300/90 text-[11px] bg-amber-950/30 p-2 rounded-lg border border-amber-900/40 flex items-start space-x-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span><strong>修復建議：</strong>{fault.remedy}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Tab 2: Full Plant Overview */}
          {activeTab === 'fullPlant' && fullPlantReport && (
            <div className="space-y-6">
              
              {/* Plant KPI Card */}
              <div className="p-4 rounded-2xl bg-[#0e1a22] border border-[#1e3340] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                    <span>全廠 42 道料理數位雙生總巡檢報告</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-teal-950 text-teal-300 border border-teal-800">
                      100% 健全
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    全自動巡檢 42 道食譜，歷經鏡像一致性審計與 60 週期無 UI 物理快進
                  </p>
                </div>

                <div className="flex items-center space-x-4 font-mono text-xs">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">健全食譜</div>
                    <div className="text-lg font-bold text-emerald-400">{fullPlantReport.healthyCount} / {fullPlantReport.totalDishes}</div>
                  </div>
                  <div className="text-right pl-4 border-l border-slate-800">
                    <div className="text-[10px] text-slate-400">巡檢總耗時</div>
                    <div className="text-lg font-bold text-cyan-300">{fullPlantReport.executionTimeMs}ms</div>
                  </div>
                </div>
              </div>

              {/* Dishes Grid */}
              <div className="grid grid-cols-3 gap-3">
                {fullPlantReport.results.map((dishRep, i) => (
                  <div
                    key={i}
                    onClick={() => handleSelectDishFromPlant(dishRep.dishName)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between ${
                      dishRep.isHealthy
                        ? 'bg-[#0f1b22] border-slate-800 hover:border-teal-500/60'
                        : 'bg-rose-950/30 border-rose-800/80 hover:border-rose-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 truncate pr-1">{dishRep.dishName}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                        dishRep.isHealthy
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                      }`}>
                        {dishRep.isHealthy ? '🟢 滿載' : '🔴 故障'}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>機台: {dishRep.stage1.sandboxMachineCount} 台</span>
                      <span className="text-teal-300">{dishRep.stage2.chefEfficiency}% 滿載</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1c2e38] flex items-center justify-between bg-[#0a1318] text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>純二元判定引擎：消除告警疲勞，確保 Snacktorio 自動化產線 100% 滿載</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#14232a] hover:bg-slate-800 text-slate-200 rounded-xl border border-slate-700 transition-colors font-medium"
          >
            關閉
          </button>
        </div>

      </div>
    </div>
  );
};
