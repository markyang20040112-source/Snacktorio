import React from 'react';
import { SandboxConnection, SandboxNodeData } from './sandboxTypes';
import { computeOrthogonalPath } from './sandboxRouting';

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
  allNodes?: SandboxNodeData[];
  nodeMap?: Map<string, SandboxNodeData>;
  hoveredConnId?: string | null;
  onHoverConnection?: (connId: string | null) => void;
  inspectedNodeId?: string | null;
  isFocusDimActive?: boolean;
}

/** SVG 連線層：已建立連線 (正交圓角走線、懸停發光流向、焦點過濾) 與拉線中的臨時虛線 */
export const SandboxConnectionsLayer: React.FC<SandboxConnectionsLayerProps> = ({
  connections,
  connectingSource,
  getPortCoordinates,
  onDeleteConnection,
  allNodes = [],
  nodeMap,
  hoveredConnId = null,
  onHoverConnection,
  inspectedNodeId = null,
  isFocusDimActive = false
}) => {
  return (
    <svg className="absolute inset-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none">
      <defs>
        <style>
          {`
            @keyframes flowDash {
              to {
                stroke-dashoffset: -20;
              }
            }
            .flow-active {
              stroke-dasharray: 6, 4 !important;
              animation: flowDash 0.8s linear infinite !important;
            }
          `}
        </style>
      </defs>

      {/* 已建立的連線 */}
      {connections.map(c => {
        const start = getPortCoordinates(c.fromNodeId, c.fromPortId, true);
        const end = getPortCoordinates(c.toNodeId, c.toPortId, false);
        const fromNode = nodeMap?.get(c.fromNodeId);
        const toNode = nodeMap?.get(c.toNodeId);

        // 智慧正交圓角走線 (不切穿方塊，全走在走線槽與行間通道中)
        const pathD = computeOrthogonalPath(start, end, fromNode, toNode, allNodes);

        // 懸停與焦點狀態判斷
        const isDirectlyHovered = hoveredConnId === c.id;
        const isNodeConnected = !!inspectedNodeId && (c.fromNodeId === inspectedNodeId || c.toNodeId === inspectedNodeId);
        const isActive = isDirectlyHovered || isNodeConnected;
        const isDimmed = isFocusDimActive && !isActive;

        // 線條色彩與外觀
        const isFluid = c.type === 'fluid';
        let strokeColor = isFluid ? '#06b6d4' : '#10b981';
        let strokeWidth = 2.5;

        if (isActive) {
          strokeColor = isFluid ? '#38bdf8' : '#34d399';
          strokeWidth = 4;
        }

        const opacityClass = isDimmed ? 'opacity-20' : 'opacity-100';

        // 標籤座標：取兩端平均位置微調
        const badgeX = (start.x + end.x) / 2 - 40;
        const badgeY = (start.y + end.y) / 2 - 12;

        return (
          <g
            key={c.id}
            className={`pointer-events-auto cursor-pointer transition-opacity duration-300 ${opacityClass}`}
            onMouseEnter={() => onHoverConnection?.(c.id)}
            onMouseLeave={() => onHoverConnection?.(null)}
          >
            {/* 粗邊熱區方便點擊與游標感應 */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              onClick={(e) => onDeleteConnection(c.id, e)}
            />

            {/* 實質導線 (具備懸停高亮、光暈與流動粒子動畫) */}
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={c.actualFlowRate > 0 ? '5,3' : 'none'}
              style={{
                filter: isActive
                  ? `drop-shadow(0 0 6px ${isFluid ? 'rgba(56,189,248,0.75)' : 'rgba(52,211,153,0.75)'})`
                  : undefined
              }}
              className={`transition-all duration-200 ${isActive ? 'flow-active' : ''}`}
            />

            {/* 流量標籤 */}
            <foreignObject
              x={badgeX}
              y={badgeY}
              width={80}
              height={26}
              className="overflow-visible pointer-events-none"
            >
              <div
                className={`px-1.5 py-0.5 rounded text-[10px] text-center font-mono font-bold whitespace-nowrap shadow-md transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-950/95 border-2 border-emerald-400 text-emerald-200 scale-110 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                    : 'bg-slate-950/80 border border-slate-700 text-slate-300'
                }`}
              >
                {c.actualFlowRate.toFixed(2)} {isFluid ? 'fl/s' : '/s'}
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
