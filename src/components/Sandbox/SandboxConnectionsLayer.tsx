import React from 'react';
import { SandboxConnection } from './sandboxTypes';

export interface ConnectingSource {
  nodeId: string;
  portId: string;
  portType: 'solid' | 'fluid';
  isOutput: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface SandboxConnectionsLayerProps {
  connections: SandboxConnection[];
  connectingSource: ConnectingSource | null;
  getPortCoordinates: (nodeId: string, portId: string, isOutput: boolean) => { x: number; y: number };
  onDeleteConnection: (connId: string, e: React.MouseEvent) => void;
}

/** SVG 連線層：已建立連線 (點擊刪除、流量標籤) 與拉線中的臨時虛線 */
export const SandboxConnectionsLayer: React.FC<SandboxConnectionsLayerProps> = ({
  connections,
  connectingSource,
  getPortCoordinates,
  onDeleteConnection
}) => {
  return (
    <svg className="absolute inset-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none">
      <defs>
        <linearGradient id="solidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="fluidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>

      {/* 已建立的連線 */}
      {connections.map(c => {
        const start = getPortCoordinates(c.fromNodeId, c.fromPortId, true);
        const end = getPortCoordinates(c.toNodeId, c.toPortId, false);
        const dx = Math.abs(end.x - start.x) * 0.5;
        const pathD = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

        return (
          <g key={c.id} className="pointer-events-auto group/conn cursor-pointer">
            {/* 粗邊熱區方便點擊刪除 */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              onClick={(e) => onDeleteConnection(c.id, e)}
            />
            {/* 實質導線 */}
            <path
              d={pathD}
              fill="none"
              stroke={c.type === 'fluid' ? '#06b6d4' : '#10b981'}
              strokeWidth={2.5}
              strokeDasharray={c.actualFlowRate > 0 ? "5,3" : "none"}
              className="transition-all group-hover/conn:stroke-rose-400 group-hover/conn:stroke-[4]"
            />
            {/* 流量標籤 */}
            <foreignObject
              x={(start.x + end.x) / 2 - 40}
              y={(start.y + end.y) / 2 - 12}
              width={80}
              height={24}
              className="overflow-visible pointer-events-none"
            >
              <div className="px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-[10px] text-center font-mono font-bold text-slate-300 whitespace-nowrap shadow-md">
                {c.actualFlowRate.toFixed(2)} {c.type === 'fluid' ? 'fl/s' : '/s'}
              </div>
            </foreignObject>
          </g>
        );
      })}

      {/* 正在拉線中的臨時虛線 (支援雙向貝茲曲線與動態指示) */}
      {connectingSource && (
        <g>
          <path
            d={connectingSource.isOutput
              ? `M ${connectingSource.startX} ${connectingSource.startY} C ${connectingSource.startX + 60} ${connectingSource.startY}, ${connectingSource.currentX - 60} ${connectingSource.currentY}, ${connectingSource.currentX} ${connectingSource.currentY}`
              : `M ${connectingSource.startX} ${connectingSource.startY} C ${connectingSource.startX - 60} ${connectingSource.startY}, ${connectingSource.currentX + 60} ${connectingSource.currentY}, ${connectingSource.currentX} ${connectingSource.currentY}`
            }
            fill="none"
            stroke={connectingSource.portType === 'fluid' ? '#06b6d4' : '#f59e0b'}
            strokeWidth={2.5}
            strokeDasharray="5,4"
            className="animate-pulse"
          />
          <circle
            cx={connectingSource.currentX}
            cy={connectingSource.currentY}
            r={5}
            fill={connectingSource.portType === 'fluid' ? '#06b6d4' : '#f59e0b'}
            className="animate-ping opacity-75"
          />
          <circle
            cx={connectingSource.currentX}
            cy={connectingSource.currentY}
            r={4}
            fill={connectingSource.portType === 'fluid' ? '#22d3ee' : '#fbbf24'}
          />
        </g>
      )}
    </svg>
  );
};
