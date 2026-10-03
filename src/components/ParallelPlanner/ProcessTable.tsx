import React from 'react';
import { ConsolidatedPlan } from '../../services/parallelPlanner';
import { PlannedDish } from '../../services/parallelPlanner';
import { getMachineBadgeClass, chunkTargets } from '../../utils/machineBadge';
import { ItemIcon } from '../Common/ItemIcon';
import { ShieldCheck, Zap, Sprout, Sparkles } from 'lucide-react';

/** 跨料理共通設備去重合併分析表（單道料理時顯示整數比模式）。 */
export const ProcessTable: React.FC<{ consolidated: ConsolidatedPlan; effectivePlannedList: PlannedDish[] }> = ({ consolidated, effectivePlannedList }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
      <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>跨料理共通設備去重合併分析表</span>
      </h3>
      <span className="text-xs text-slate-400">
        按總需求流率自動 CEILING 向上取整
      </span>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs">
            <th className="py-3 px-4 whitespace-nowrap">工序項目</th>
            <th className="py-3 px-4 whitespace-nowrap">設備</th>
            {consolidated.isSingleDish ? (
              <>
                <th className="py-3 px-4 text-right whitespace-nowrap" title="單台設備標準產出或消耗速率">單台產率</th>
                <th className="py-3 px-4 text-right whitespace-nowrap" title="理論精確需求台數">理論需量</th>
                <th className="py-3 px-4 text-right whitespace-nowrap text-cyan-300 font-bold" title="向上取整後的實際配置台數">實際台數</th>
                <th className="py-3 px-4 text-center whitespace-nowrap text-amber-300 font-bold" title="全線最簡整數比 (GCD)，便於模組化堆疊建造">整數比</th>
              </>
            ) : (
              <>
                {effectivePlannedList.map(p => (
                  <th key={p.id} className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end">
                      <div className="flex items-center space-x-1">
                        {p.isAutoAdded && (
                          <span className="text-[10px] text-amber-400 font-bold bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30 whitespace-nowrap">
                            配餐
                          </span>
                        )}
                        <span>{p.dishName}</span>
                      </div>
                      <span className="text-slate-400 font-mono text-[11px]">({p.rateMin} 份/分)</span>
                    </div>
                  </th>
                ))}
                <th className="py-3 px-4 text-right whitespace-nowrap">並聯總需求</th>
                <th className="py-3 px-4 text-right text-slate-400 whitespace-nowrap">獨立合計</th>
                <th className="py-3 px-4 text-right font-bold text-cyan-300 whitespace-nowrap">並聯實需</th>
                <th className="py-3 px-4 text-center text-emerald-400 font-bold whitespace-nowrap">節省設備</th>
              </>
            )}
            <th className="py-3 px-4 text-right whitespace-nowrap">電力</th>
            <th className="py-3 px-4 text-right whitespace-nowrap">哥布林</th>
            <th className="py-3 px-4 min-w-[320px]">物料關聯與拓撲說明</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {consolidated.processes.map((r, idx) => {
            const isBaseFeeder = r.isBaseFeeder || r.processName.includes('底料作物採集');
            const isFullyOffsetFeeder = isBaseFeeder && r.parallelRounded === 0;

            return (
              <tr
                key={idx}
                className={`transition-colors ${
                  isFullyOffsetFeeder
                    ? 'bg-emerald-950/20 text-emerald-200 border-t border-b border-emerald-500/30 hover:bg-emerald-950/30'
                    : isBaseFeeder
                    ? 'bg-purple-950/20 text-purple-200 border-t border-purple-500/30 hover:bg-purple-950/30'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                {/* 1. 工序項目 */}
                <td className="py-3 px-4 font-medium text-slate-100">
                  <div className="flex items-center space-x-2 whitespace-nowrap">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                        r.machine === '自動廚師機'
                          ? 'bg-amber-950/70 text-amber-300 border-amber-500/50'
                          : isBaseFeeder
                          ? 'bg-purple-950/70 text-purple-300 border-purple-500/50'
                          : 'bg-slate-800/90 text-slate-300 border-slate-700/60'
                      }`}
                      title={
                        r.machine === '自動廚師機'
                          ? '終端出餐工序 (Tier 0)'
                          : isBaseFeeder
                          ? '全廠底料作物收割 (底料層)'
                          : `第 ${r.tier ?? 1} 階加工工序 (由下游至上游)`
                      }
                    >
                      {r.machine === '自動廚師機' ? '終端' : isBaseFeeder ? '底料' : `T${r.tier ?? 1}`}
                    </span>
                    <ItemIcon name={r.processName} size="xs" />
                    {isBaseFeeder && (
                      <Sprout className={`w-4 h-4 shrink-0 ${isFullyOffsetFeeder ? 'text-emerald-400' : 'text-purple-400'}`} />
                    )}
                    <span>{r.processName}</span>
                  </div>

                  {/* Donors */}
                  {r.feederRoles.filter(fr => fr.role === 'donor').length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {r.feederRoles.filter(fr => fr.role === 'donor').map((fr, fIdx) => (
                        <span key={fIdx} className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-normal whitespace-nowrap">
                          <Zap className="w-3 h-3 text-emerald-400 inline shrink-0" />
                          <span>{effectivePlannedList.length > 1 ? `【${fr.dishName}】：` : ''}{fr.note}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Recipients */}
                  {r.feederRoles.filter(fr => fr.role === 'recipient').length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {r.feederRoles.filter(fr => fr.role === 'recipient').map((fr, fIdx) => (
                        <span key={fIdx} className="inline-flex items-center space-x-1 text-[11px] text-purple-300 font-normal whitespace-nowrap">
                          <Sprout className="w-3 h-3 text-purple-400 inline shrink-0" />
                          <span>{effectivePlannedList.length > 1 ? `【${fr.dishName}】：` : ''}{fr.note}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Base Feeder summary tag */}
                  {isBaseFeeder && r.baseFeederSummary && (
                    <div className="mt-1 text-[11px] font-normal whitespace-nowrap">
                      {r.baseFeederSummary.offsetCount > 0 ? (
                        <span className="text-emerald-300 flex items-center space-x-1 whitespace-nowrap">
                          <Sparkles className="w-3 h-3 text-emerald-400 inline shrink-0" />
                          <span>全廠由副產物折抵 {r.baseFeederSummary.offsetCount} 台底料收割機</span>
                        </span>
                      ) : (
                        <span className="text-purple-300/80 whitespace-nowrap">
                          每台底料需求設備 1:1 獨立配屬作物收割機
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* 2. 設備 */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className={`inline-flex items-center space-x-1.5 whitespace-nowrap px-2 py-0.5 rounded text-xs font-mono border ${
                    isFullyOffsetFeeder
                      ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-200'
                      : isBaseFeeder
                      ? 'bg-purple-900/50 border-purple-500/40 text-purple-200'
                      : getMachineBadgeClass(r.machine)
                  }`}>
                    <ItemIcon name={r.machine} size="xs" showBorder={false} />
                    <span>{r.machine}</span>
                  </span>
                </td>

                {/* 3+. Dynamic Columns: Single Dish vs Multi Dish */}
                {consolidated.isSingleDish ? (
                  <>
                    {/* 單台產率 */}
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                      {r.baseRateDisplay || (r.baseRate ? `${r.baseRate.toFixed(2)}/s` : '0.20/s')}
                    </td>
                    {/* 理論需量 */}
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                      {r.totalDemandRate.toFixed(2)} 台
                    </td>
                    {/* 實際台數 */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-base whitespace-nowrap">
                      {isFullyOffsetFeeder ? (
                        <span className="text-emerald-400">0 台</span>
                      ) : (
                        <span className="text-cyan-300">{r.parallelRounded} 台</span>
                      )}
                    </td>
                    {/* 整數比 */}
                    <td className="py-3 px-4 text-center font-mono font-bold text-sm text-amber-300 whitespace-nowrap">
                      {isFullyOffsetFeeder ? '-' : (r.integerRatio || r.parallelRounded)}
                    </td>
                  </>
                ) : (
                  <>
                    {/* 各料理需求 */}
                    {effectivePlannedList.map(p => {
                      const found = r.dishDemands.find(d => d.dishName === p.dishName);
                      return (
                        <td key={p.id} className="py-3 px-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                          {found ? (
                            <div>
                              <div className="whitespace-nowrap">{found.demand.toFixed(2)} 台</div>
                              {found.feederRole === 'donor' && (
                                <span className="text-[10px] text-emerald-400 block font-normal font-sans whitespace-nowrap">⚡ 過剩供給</span>
                              )}
                              {found.feederRole === 'recipient' && (
                                <span className="text-[10px] text-purple-300 block font-normal font-sans whitespace-nowrap">🌱 接收底料</span>
                              )}
                              {isBaseFeeder && found.offsetCount && found.offsetCount > 0 ? (
                                <span className="text-[10px] text-emerald-400 block font-normal font-sans whitespace-nowrap">
                                  (已折抵 {found.offsetCount} 台)
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      );
                    })}

                    {/* 並聯總需求 */}
                    <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                      {r.totalDemandRate.toFixed(2)} 台
                    </td>

                    {/* 獨立合計 */}
                    <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                      {r.independentSum} 台
                    </td>

                    {/* 並聯實需 */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-base whitespace-nowrap">
                      {isFullyOffsetFeeder ? (
                        <span className="text-emerald-400">0 台</span>
                      ) : (
                        <span className="text-cyan-300">{r.parallelRounded} 台</span>
                      )}
                      {effectivePlannedList.length > 1 && r.feederRoles.some(fr => fr.role === 'donor') && (
                        <span className="text-[10px] text-emerald-400 block font-normal font-sans whitespace-nowrap">⚡ 過剩供給</span>
                      )}
                      {effectivePlannedList.length > 1 && r.feederRoles.some(fr => fr.role === 'recipient') && (
                        <span className="text-[10px] text-purple-300 block font-normal font-sans whitespace-nowrap">🌱 接收底料</span>
                      )}
                    </td>

                    {/* 節省設備 */}
                    <td className="py-3 px-4 text-center font-mono font-bold whitespace-nowrap">
                      {isBaseFeeder && r.baseFeederSummary && r.baseFeederSummary.offsetCount > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold whitespace-nowrap">
                          折抵 {r.baseFeederSummary.offsetCount} 台
                        </span>
                      ) : r.savedCount > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs whitespace-nowrap">
                          節省 {r.savedCount} 台
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">-</span>
                      )}
                    </td>
                  </>
                )}

                {/* 電力 */}
                <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                  {(r.parallelRounded * r.powerPerUnit).toFixed(1)} FV/s
                </td>

                {/* 哥布林 */}
                <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                  {(r.parallelRounded * r.goblinsPerUnit).toFixed(0)} 隻
                </td>

                {/* 8. 物料關聯與拓撲說明 */}
                <td className="py-3 px-4 text-xs">
                  {isBaseFeeder ? (
                    (() => {
                      const consumerLabel = r.baseFeederSummary?.consumerMachine || '物質操縱機';
                      if (r.baseFeederSummary && r.baseFeederSummary.offsetCount > 0) {
                        return (
                          <div className="flex items-center space-x-1.5 whitespace-nowrap" title={r.baseFeederSummary.offsetDetails.join('；')}>
                            <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(consumerLabel, true)}`}>
                              {consumerLabel}
                            </span>
                            {r.parallelRounded === 0 ? (
                              <span className="text-xs text-emerald-300 font-medium">
                                🎉 (全廠副產物全額折抵免建)
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-300 font-medium">
                                (已折抵 {r.baseFeederSummary.offsetCount} 台，剩餘需直供)
                              </span>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="flex items-center space-x-1.5 whitespace-nowrap" title={`專線直供${consumerLabel}，每 5 秒消耗 1 份作物底料 (0.20/s 直供防堵專線)`}>
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(consumerLabel)}`}>
                            {consumerLabel}
                          </span>
                          <span className="font-mono font-bold text-xs text-slate-200">1</span>
                          <span className="text-xs text-purple-300 font-normal">
                            (1:1 防堵專線)
                          </span>
                        </div>
                      );
                    })()
                  ) : r.machine === '自動廚師機' ? (
                    <span className="text-amber-400 font-bold whitespace-nowrap">終端出餐 (大炮發射)</span>
                  ) : r.downstreamTargets && r.downstreamTargets.length > 0 ? (
                    (() => {
                      const firstTargets = r.downstreamTargets[0]?.targets || [];
                      const allSame = r.downstreamTargets.every(dt =>
                        dt.targets.length === firstTargets.length &&
                        dt.targets.every((t, i) => t.machine === firstTargets[i].machine && t.ratio === firstTargets[i].ratio && t.isByproduct === firstTargets[i].isByproduct)
                      );

                      if (allSame) {
                        return (
                          <table className="border-separate border-spacing-y-1.5 border-spacing-x-0 text-xs w-auto">
                            <tbody>
                              {chunkTargets(firstTargets).map((pair, rowIdx) => (
                                <tr key={rowIdx} className="align-middle">
                                  {pair.map((t, tIdx) => (
                                    <td key={tIdx} className="pr-3.5 align-middle whitespace-nowrap">
                                      <div
                                        className="flex items-center space-x-1.5 whitespace-nowrap shrink-0"
                                        title={`連至工序：【${t.processName}】`}
                                      >
                                        <span className={`inline-flex items-center space-x-1 whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(t.machine, t.isByproduct)}`}>
                                          <ItemIcon name={t.machine} size="xs" showBorder={false} />
                                          <span>{t.machine}</span>
                                        </span>
                                        {t.isFluid ? (
                                          <span className="font-mono font-bold text-xs text-cyan-300">
                                            {t.note || `${t.ratio}.0 fl/s`}
                                          </span>
                                        ) : (
                                          <span className={`font-mono font-bold text-xs ${t.isByproduct ? 'text-emerald-400' : 'text-slate-200'}`}>
                                            {t.ratio}
                                          </span>
                                        )}
                                        {t.isByproduct && (
                                          <span className="text-[10px] text-emerald-400 font-normal font-sans">(副產物折抵)</span>
                                        )}
                                      </div>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      }

                      return (
                        <table className="border-separate border-spacing-y-1.5 border-spacing-x-0 text-xs w-auto">
                          <tbody>
                            {r.downstreamTargets.map((dt, dtIdx) => (
                              <React.Fragment key={dtIdx}>
                                {chunkTargets(dt.targets).map((pair, rowIdx) => (
                                  <tr key={rowIdx} className="align-middle">
                                    {effectivePlannedList.length > 1 && (
                                      <td className="pr-3 text-slate-400 font-medium whitespace-nowrap align-middle">
                                        {rowIdx === 0 ? `【${dt.dishName}】` : ''}
                                      </td>
                                    )}
                                    {pair.map((t, tIdx) => (
                                      <td key={tIdx} className="pr-3.5 align-middle whitespace-nowrap">
                                        <div
                                          className="flex items-center space-x-1.5 whitespace-nowrap shrink-0"
                                          title={`連至工序：【${t.processName}】`}
                                        >
                                          <span className={`inline-flex items-center space-x-1 whitespace-nowrap px-2 py-0.5 rounded border text-xs font-mono ${getMachineBadgeClass(t.machine, t.isByproduct)}`}>
                                            <ItemIcon name={t.machine} size="xs" showBorder={false} />
                                            <span>{t.machine}</span>
                                          </span>
                                          {t.isFluid ? (
                                            <span className="font-mono font-bold text-xs text-cyan-300">
                                              {t.note || `${t.ratio}.0 fl/s`}
                                            </span>
                                          ) : (
                                            <span className={`font-mono font-bold text-xs ${t.isByproduct ? 'text-emerald-400' : 'text-slate-200'}`}>
                                              {t.ratio}
                                            </span>
                                          )}
                                          {t.isByproduct && (
                                            <span className="text-[10px] text-emerald-400 font-normal font-sans">(副產物折抵)</span>
                                          )}
                                        </div>
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()
                  ) : (
                    <div className="text-slate-400">
                      {r.topologies.length > 0 ? (
                        r.topologies.length === 1 || r.topologies.every(t => t.text === r.topologies[0].text) ? (
                          <span>{r.topologies[0].text}</span>
                        ) : (
                          <table className="border-separate border-spacing-y-0.5 border-spacing-x-0 text-xs w-auto">
                            <tbody>
                              {r.topologies.map((t, tIdx) => (
                                <tr key={tIdx} className="text-slate-400">
                                  <td className="pr-2 text-slate-300 font-medium whitespace-nowrap align-top">
                                    【{t.dishName}】
                                  </td>
                                  <td className="align-top">
                                    {t.text}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
