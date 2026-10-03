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
  onStartConnect: (nodeId: string, portId: string, portType: 'solid' | 'fluid', isOutput: boolean, e: React.MouseEvent) => void;
  onEndConnect: (nodeId: string, portId: string, e: React.MouseEvent) => void;
}

export const SandboxNode: React.FC<SandboxNodeProps> = ({
  node,
  isSelected,
  onSelect,
  onDelete,
  onToggleMock,
  onStartConnect,
  onEndConnect
}) => {
  const isGenerator = node.type === 'generator';
  const isPump = node.type === 'pump';
  const isEnvPool = node.type === 'environment_pool';

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
          <ItemIcon name={node.recipeName || node.machineName || node.title} size="sm" />
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
                <span className={`px-1.5 py-0.2 rounded border text-[9px] font-mono ${getMachineBadgeClass(node.machineName)}`}>
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
            <span className="font-mono">{node.actualCycleTime}s/次</span>
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
                onMouseUp={(e) => onEndConnect(node.id, port.id, e)}
              >
                {/* 端口連接圓點 */}
                <div 
                  className={`w-3 h-3 rounded-full border-2 transition-transform group-hover/port:scale-125 shrink-0 ${
                    port.type === 'fluid'
                      ? 'bg-cyan-500 border-cyan-200 shadow-sm shadow-cyan-500/50'
                      : 'bg-amber-500 border-amber-200 shadow-sm shadow-amber-500/50'
                  }`}
                  title={`輸入端口：${port.name} (${port.rateRequired || 0.2}/s)`}
                />
                <span className="text-[10px] text-slate-300 truncate max-w-[85px]" title={port.name}>
                  {port.name}
                </span>
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
              >
                {port.type === 'fluid' && <Droplets className="w-2.5 h-2.5 text-cyan-400 shrink-0" />}
                <span className="text-[10px] text-slate-300 truncate max-w-[85px]" title={port.name}>
                  {port.name}
                </span>
                {/* 端口拉出圓點 */}
                <div 
                  className={`w-3 h-3 rounded-full border-2 transition-transform group-hover/port:scale-125 shrink-0 ${
                    port.type === 'fluid'
                      ? 'bg-cyan-400 border-cyan-100 shadow-sm shadow-cyan-400/50'
                      : 'bg-emerald-400 border-emerald-100 shadow-sm shadow-emerald-400/50'
                  }`}
                  title={`輸出端口：按住拖曳連線 (${port.rateProvided || 0}/s)`}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
