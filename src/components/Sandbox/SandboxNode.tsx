import React from 'react';
import { SandboxNodeData } from './sandboxTypes';
import { ItemIcon } from '../Common/ItemIcon';
import { getMachineBadgeClass } from '../../utils/machineBadge';
import { Zap, Users, Flame, Droplets, Trash2, Infinity as InfinityIcon } from 'lucide-react';

interface SandboxNodeProps {
  node: SandboxNodeData;
  isSelected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string) => void;
  onToggleMock: (id: string) => void;
  onUpdateNode?: (id: string, updates: Partial<SandboxNodeData>) => void;
  onUpdateDishTargetRate?: (id: string, rateMin: number) => void;
  onStartConnect: (nodeId: string, portId: string, portType: 'solid' | 'fluid', isOutput: boolean, e: React.MouseEvent) => void;
  onEndConnect: (nodeId: string, portId: string, isOutput: boolean, e: React.MouseEvent) => void;
}

export const SandboxNode: React.FC<SandboxNodeProps> = ({
  node,
  isSelected,
  onSelect,
  onDelete,
  onToggleMock,
  onUpdateNode,
  onUpdateDishTargetRate,
  onStartConnect,
  onEndConnect
}) => {
  const isGenerator = node.type === 'generator';
  const isPump = node.type === 'pump';
  const isEnvPool = node.type === 'environment_pool';
  const isSplitter = node.type === 'splitter';
  const isBufferDecay = node.type === 'buffer_decay';

  // 狀態邊框顏色
  let borderClass = 'border-slate-800 bg-[#0f171c]/95';
  if (isSelected) {
    borderClass = 'border-amber-400 ring-2 ring-amber-400/30 bg-[#142027]/98';
  } else if (node.efficiency === 0) {
    borderClass = 'border-rose-600/70 bg-[#1a0e12]/95';
  } else if (node.efficiency < 1.0) {
    borderClass = 'border-amber-500/70 bg-[#1a170f]/95';
  } else if (isGenerator) {
    borderClass = 'border-amber-500/40 bg-[#1c180e]/95';
  } else if (isPump || isEnvPool) {
    borderClass = 'border-cyan-500/40 bg-[#0e181c]/95';
  } else if (isSplitter) {
    borderClass = 'border-blue-500/40 bg-[#0d1624]/95';
  } else if (isBufferDecay) {
    borderClass = 'border-emerald-500/40 bg-[#0c1a14]/95';
  }

  return (
    <div
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        touchAction: 'none'
      }}
      className={`absolute w-72 rounded-2xl border shadow-xl backdrop-blur-md transition-shadow select-none group cursor-move ${borderClass}`}
      onMouseDown={(e) => onSelect(node.id, e)}
    >
      {/* 頂部標題列 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800/80 bg-slate-950/40 rounded-t-2xl">
        <div className="flex items-center space-x-2 min-w-0">
          <ItemIcon name={node.machineName === '自動廚師機' ? (node.machineName || node.title) : (node.recipeName || node.machineName || node.title)} size="sm" />
          <div className="truncate">
            <div className="text-xs font-bold text-slate-200 truncate flex items-center space-x-1.5">
              <span>{node.title}</span>
              {node.isMockInfiniteSupply && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono flex items-center space-x-0.5 border border-amber-500/40" title="無中生有：原料無限供應">
                  <InfinityIcon className="w-2.5 h-2.5" />
                  <span>無限料</span>
                </span>
              )}
            </div>
            {node.machineName && (
              <div className="text-[10px] text-slate-400 truncate">
                <span className={`px-1.5 py-0.2 rounded border text-[9px] font-mono ${
                  isSplitter ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                  isBufferDecay ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  getMachineBadgeClass(node.machineName)
                }`}>
                  {node.machineName}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 快捷控制鍵 */}
        <div className="flex items-center space-x-1 shrink-0 ml-1">
          {node.type === 'machine' && node.inputs.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMock(node.id);
              }}
              title={node.isMockInfiniteSupply ? "切換回真實連線供料" : "開啟無中生有 (無限供料)"}
              className={`p-1 rounded-lg text-xs transition-colors ${
                node.isMockInfiniteSupply 
                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' 
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              <InfinityIcon className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            title="刪除此節點"
            className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 機台運轉參數與狀態反饋 */}
      <div className="p-3 space-y-2 text-[11px]">
        {/* 電網與妖精數值 */}
        <div className="flex items-center justify-between text-slate-400">
          <div className="flex items-center space-x-1">
            <Zap className={`w-3.5 h-3.5 ${isGenerator ? 'text-amber-400' : 'text-slate-400'}`} />
            <span className="font-mono">
              {isGenerator ? `+${node.basePowerConsumption} FV/s` : `${node.basePowerConsumption} FV/s`}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-mono">{node.baseGoblins} 妖精</span>
          </div>

          <div className="flex items-center space-x-1">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span className="font-mono">{isSplitter ? '即時' : `${node.actualCycleTime}s/次`}</span>
          </div>
        </div>

        {/* 狀態警告標籤 */}
        {node.statusNote && (
          <div className={`p-1.5 rounded-lg text-[10px] leading-tight font-medium ${
            node.efficiency === 0 
              ? 'bg-rose-950/50 text-rose-300 border border-rose-800/60'
              : node.efficiency < 1.0 
                ? 'bg-amber-950/50 text-amber-300 border border-amber-800/60'
                : 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/30'
          }`}>
            {node.statusNote}
          </div>
        )}

        {/* 產能跟不上強烈警示標籤 */}
        {node.inputs.some(p => p.isDeficit) && (
          <div className="p-1.5 rounded-lg bg-rose-950/80 border border-rose-600/80 text-[10px] text-rose-300 font-bold flex items-center space-x-1 animate-pulse">
            <span>⚠️ 產能跟不上！上游原料供應不足</span>
          </div>
        )}

        {/* 終端料理產能目標設定面板 (X 份/分，隨炙熱菜餚連動) */}
        {node.machineName === '自動廚師機' && !!node.recipeName && (
          <div className="p-2 rounded-xl bg-slate-900/90 border border-amber-900/40 space-y-1.5 mt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-amber-300">🎯 出餐目標</span>
                {node.isAutoPepto && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold" title="自動隨全廠炙熱菜餚產能加總動態連動">
                    🌶️ 隨炙熱連動
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-300 font-bold">
                {node.targetRatePerMin || 12} 份/分
              </span>
            </div>

            {/* 快捷目標切換與自訂輸入 */}
            <div className="flex items-center space-x-1">
              {[12, 24, 36].map(rate => (
                <button
                  key={rate}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onUpdateDishTargetRate) {
                      onUpdateDishTargetRate(node.id, rate);
                    }
                  }}
                  className={`flex-1 py-0.5 rounded text-[9px] font-mono transition-colors ${
                    (node.targetRatePerMin || 12) === rate
                      ? 'bg-amber-500/30 text-amber-300 font-bold border border-amber-500/50'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                  title={`設定出餐目標為 ${rate} 份/分`}
                >
                  {rate}
                </button>
              ))}
              <div className="flex items-center bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 w-16">
                <input
                  type="number"
                  min="1"
                  value={node.targetRatePerMin || 12}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    const val = Math.max(1, Number(e.target.value) || 12);
                    if (onUpdateDishTargetRate) {
                      onUpdateDishTargetRate(node.id, val);
                    }
                  }}
                  className="w-full bg-transparent text-[9px] font-mono text-amber-200 outline-none text-center"
                />
                <span className="text-[8px] text-slate-500 ml-0.5">/分</span>
              </div>
            </div>
          </div>
        )}

        {/* 分流器專屬互動配置面板 (一進二出 / 一進三出、均分 / 自訂流量) */}
        {isSplitter && onUpdateNode && (
          <div className="p-2 rounded-xl bg-slate-900/90 border border-blue-900/50 space-y-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-300">分流模式設置</span>
              <div className="flex items-center space-x-1">
                {/* 2出 / 3出 切換按鈕 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newOutputs: typeof node.outputs = [
                      { id: 'out-item-1', name: node.outputs[0]?.name || '分流A', type: 'solid', rateProvided: 0 },
                      { id: 'out-item-2', name: node.outputs[1]?.name || '分流B', type: 'solid', rateProvided: 0 }
                    ];
                    const custom = node.splitterCustomRates?.slice(0, 2) || [0.1, 0.1];
                    onUpdateNode(node.id, { outputs: newOutputs, splitterCustomRates: custom });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
                    node.outputs.length === 2 
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50 font-bold' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  }`}
                  title="切換為 2 個輸出端"
                >
                  2 出
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newOutputs: typeof node.outputs = [
                      { id: 'out-item-1', name: node.outputs[0]?.name || '分流A', type: 'solid', rateProvided: 0 },
                      { id: 'out-item-2', name: node.outputs[1]?.name || '分流B', type: 'solid', rateProvided: 0 },
                      { id: 'out-item-3', name: node.outputs[2]?.name || '分流C', type: 'solid', rateProvided: 0 }
                    ];
                    const custom = node.splitterCustomRates ? [...node.splitterCustomRates, 0.1].slice(0, 3) : [0.1, 0.1, 0.1];
                    onUpdateNode(node.id, { outputs: newOutputs, splitterCustomRates: custom });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
                    node.outputs.length === 3 
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50 font-bold' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  }`}
                  title="切換為 3 個輸出端"
                >
                  3 出
                </button>
              </div>
            </div>

            {/* 均分 vs 自訂流量切換 */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNode(node.id, { splitterMode: 'equal' });
                }}
                className={`flex-1 py-0.5 rounded text-[9px] transition-colors ${
                  node.splitterMode !== 'custom' 
                    ? 'bg-blue-500/20 text-blue-300 font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚖️ 均等分流
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const defaults = node.outputs.map((_, idx) => node.splitterCustomRates?.[idx] ?? 0.1);
                  onUpdateNode(node.id, { splitterMode: 'custom', splitterCustomRates: defaults });
                }}
                className={`flex-1 py-0.5 rounded text-[9px] transition-colors ${
                  node.splitterMode === 'custom' 
                    ? 'bg-blue-500/20 text-blue-300 font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚙️ 自訂流量
              </button>
            </div>

            {/* 自訂各端口限流數值輸入 */}
            {node.splitterMode === 'custom' && (
              <div className="space-y-1 pt-1">
                <div className="text-[9px] text-slate-400 flex justify-between">
                  <span>各端口限流 (個/秒)</span>
                  <span className="text-blue-400 font-mono">
                    合: {(node.splitterCustomRates?.reduce((a, b) => a + b, 0) || 0).toFixed(2)}/s
                  </span>
                </div>
                <div className={`grid gap-1 ${node.outputs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {node.outputs.map((_, idx) => {
                    const currentVal = node.splitterCustomRates?.[idx] ?? 0.1;
                    return (
                      <div key={idx} className="flex items-center space-x-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        <span className="text-[9px] text-slate-500 font-mono">{String.fromCharCode(65 + idx)}:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={currentVal}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const val = parseFloat(e.target.value) || 0;
                            const newRates = [...(node.splitterCustomRates || node.outputs.map(() => 0.1))];
                            newRates[idx] = Math.max(0, val);
                            onUpdateNode(node.id, { splitterCustomRates: newRates });
                          }}
                          className="w-full bg-transparent text-[10px] font-mono text-slate-200 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 稼動率進度條 */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>稼動率</span>
            <span className="font-mono font-bold text-slate-200">
              {(node.efficiency * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                node.efficiency === 0 
                  ? 'bg-rose-500' 
                  : node.efficiency < 1.0 
                    ? 'bg-amber-400' 
                    : 'bg-emerald-400'
              }`}
              style={{ width: `${node.efficiency * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 端口區：左側輸入 (Inputs) & 右側輸出 (Outputs) */}
      <div className="border-t border-slate-800/80 px-3 py-2 bg-slate-950/60 rounded-b-2xl flex justify-between items-start gap-2">
        {/* 輸入端 */}
        <div className="flex-1 space-y-1.5">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">輸入端</div>
          {node.inputs.length === 0 ? (
            <div className="text-[10px] text-slate-600 italic">無 (自主產出)</div>
          ) : (
              node.inputs.map(port => (
              <div 
                key={port.id} 
                className="flex items-center space-x-1.5 group/port relative cursor-pointer"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onStartConnect(node.id, port.id, port.type, false, e);
                }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  onEndConnect(node.id, port.id, false, e);
                }}
              >
                {/* 端口連接圓點 */}
                <div 
                  className={`w-3 h-3 rounded-full border-2 transition-transform group-hover/port:scale-125 shrink-0 ${
                    port.isDeficit
                      ? 'bg-rose-500 border-rose-200 shadow-sm shadow-rose-500/80 animate-pulse'
                      : port.type === 'fluid'
                        ? 'bg-cyan-500 border-cyan-200 shadow-sm shadow-cyan-500/50'
                        : 'bg-amber-500 border-amber-200 shadow-sm shadow-amber-500/50'
                  }`}
                  title={`輸入端口：${port.name} (${port.rateRequired || 0.2}/s) · 可拖曳拉線或作為連線終點`}
                />
                <div className="flex items-center space-x-1 min-w-0">
                  <span className="text-[10px] text-slate-300 truncate max-w-[65px]" title={port.name}>
                    {port.name}
                  </span>
                  {port.rateRequired !== undefined && (
                    <span 
                      className={`text-[9px] font-mono px-1 rounded transition-colors ${
                        port.isDeficit 
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/80 font-bold' 
                          : 'text-slate-500'
                      }`}
                      title={port.isDeficit ? `產能跟不上！實供 ${port.rateReceived ?? 0}/s < 需求 ${port.rateRequired}/s` : `需求：${port.rateRequired}/s`}
                    >
                      {port.rateReceived !== undefined ? `${port.rateReceived.toFixed(2)}/` : ''}{port.rateRequired}{port.type === 'fluid' ? 'fl' : ''}/s
                    </span>
                  )}
                </div>
                {port.type === 'fluid' && <Droplets className="w-2.5 h-2.5 text-cyan-400 shrink-0" />}
              </div>
            ))
          )}
        </div>

        {/* 輸出端 */}
        <div className="flex-1 space-y-1.5 text-right">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">輸出端</div>
          {node.outputs.length === 0 ? (
            <div className="text-[10px] text-slate-600 italic">終端銷毀/出餐</div>
          ) : (
            node.outputs.map(port => (
              <div 
                key={port.id} 
                className="flex items-center justify-end space-x-1.5 group/port relative cursor-pointer"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onStartConnect(node.id, port.id, port.type, true, e);
                }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  onEndConnect(node.id, port.id, true, e);
                }}
              >
                {port.type === 'fluid' && <Droplets className="w-2.5 h-2.5 text-cyan-400 shrink-0" />}
                <div className="flex items-center justify-end space-x-1 min-w-0">
                  {node.targetRatePerMin && (
                    <span className="text-[9px] font-mono text-emerald-400 font-bold shrink-0" title={`目標產能：${node.targetRatePerMin} 份/分`}>
                      {node.targetRatePerMin}份/分
                    </span>
                  )}
                  <span className="text-[10px] text-slate-300 truncate max-w-[65px]" title={port.name}>
                    {port.name}
                  </span>
                </div>
                {/* 端口拉出圓點 */}
                <div 
                  className={`w-3 h-3 rounded-full border-2 transition-transform group-hover/port:scale-125 shrink-0 ${
                    port.type === 'fluid'
                      ? 'bg-cyan-400 border-cyan-100 shadow-sm shadow-cyan-400/50'
                      : 'bg-emerald-400 border-emerald-100 shadow-sm shadow-emerald-400/50'
                  }`}
                  title={`輸出端口：${port.name} (${port.rateProvided || 0}/s) · 可拖曳拉線或作為連線終點`}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
