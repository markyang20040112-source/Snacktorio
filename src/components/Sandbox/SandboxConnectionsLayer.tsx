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
  // 預先為多條流體或長距跨欄連線分配獨立高空/地下通道軌道 (Corridor Tracks)
  const topTrackMap = new Map<string, number>();
  const bottomTrackMap = new Map<string, number>();
  let topCount = 0;
  let bottomCount = 0;

  connections.forEach(c => {
    const isVoidFluid = c.type === 'fluid' && (c.itemOrFluidName === '虛空' || c.toPortId?.includes('虛空') || c.fromPortId?.includes('虛空'));
    if (isVoidFluid) {
      bottomTrackMap.set(c.id, bottomCount++);
    } else if (c.type === 'fluid') {
      topTrackMap.set(c.id, topCount++);
    }
  });

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

        // 順向走線槽位分流：依目標輸入端口順序排列垂直軌道
        // 關鍵幾何法則 (契合使用者手繪圖無交叉並行架構)：
        // 當連線由上往下進料時 (end.y >= start.y)，上方端口 (inIdx 小) 位於最右側軌道 (緊鄰目標機台)；
        // 下方端口 (inIdx 大) 依序向左展開。
        // 這樣上方線條在到達上方端口時直接向右轉入，完全不與下方線條產生交叉！
        const isDownwards = end.y >= start.y;
        const portDirection = isDownwards ? -1 : 1;
        let slotOffset = 0;
        if (toNode && toNode.inputs.length > 1) {
          const inIdx = toNode.inputs.findIndex(p => p.id === c.toPortId);
          if (inIdx >= 0) {
            slotOffset += portDirection * (inIdx - (toNode.inputs.length - 1) / 2) * 16;
          }
        }
        if (fromNode && fromNode.outputs.length > 1) {
          const outIdx = fromNode.outputs.findIndex(p => p.id === c.fromPortId);
          if (outIdx >= 0) {
            slotOffset += (outIdx - (fromNode.outputs.length - 1) / 2) * 8;
          }
        }
        slotOffset = Math.max(-32, Math.min(32, slotOffset));

        const isVoidFluid = c.type === 'fluid' && (c.itemOrFluidName === '虛空' || c.toPortId?.includes('虛空') || c.fromPortId?.includes('虛空'));
        const isFluid = c.type === 'fluid';
        const corridorTrack = isVoidFluid
          ? (bottomTrackMap.get(c.id) || 0)
          : (topTrackMap.get(c.id) || 0);

        // 智慧正交圓角走線 (不切穿方塊，全走在走線槽與行間通道中；虛空優先走下方通道，水管走上方，同向多管獨立分軌)
        const pathD = computeOrthogonalPath(start, end, fromNode, toNode, allNodes, {
          slotOffset,
          isFluid,
          fluidName: c.itemOrFluidName,
          preferBelow: isVoidFluid ? true : undefined,
          corridorTrack
        });

        // 懸停與焦點狀態判斷
        const isDirectlyHovered = hoveredConnId === c.id;
        const isNodeConnected = !!inspectedNodeId && (c.fromNodeId === inspectedNodeId || c.toNodeId === inspectedNodeId);
        const isActive = isDirectlyHovered || isNodeConnected;
        const isDimmed = isFocusDimActive && !isActive;

        // 線條色彩與外觀
        let strokeColor = isFluid ? '#06b6d4' : '#10b981';
        let strokeWidth = 2.5;

        if (isActive) {
          strokeColor = isFluid ? '#38bdf8' : '#34d399';
          strokeWidth = 4;
        }

        const opacityClass = isDimmed ? 'opacity-20' : 'opacity-100';

        // 流量標籤座標：置於出料橫向線段旁 (靠起點右側 8px)，避免遮擋垂直主走線槽與其它並行線條
        let badgeX: number;
        let badgeY: number;

        if (Math.abs(start.y - end.y) < 15) {
          // 水平直線：置於起訖中點
          badgeX = (start.x + end.x) / 2 - 27;
          badgeY = (start.y + end.y) / 2 - 12;
        } else if (end.x >= start.x + 36) {
          // 順向走線：緊貼出料端右側出線段，各機台出料標籤清楚對齊自己的出料口
          badgeX = start.x + 8;
          badgeY = start.y - 12;
        } else {
          // 逆向或特殊走線：緊貼目標入料端左側
          badgeX = end.x - 62;
          badgeY = end.y - 12;
        }

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
              width={54}
              height={24}
              className="overflow-visible pointer-events-none"
            >
              <div
                className={`px-1 py-0.5 rounded text-[9px] text-center font-mono font-bold whitespace-nowrap shadow-md transition-all duration-200 ${
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
