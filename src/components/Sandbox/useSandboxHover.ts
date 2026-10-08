import { useState, useRef, useCallback, useMemo } from 'react';
import { SandboxConnection } from './sandboxTypes';

export type NodeGlowMode = 'source' | 'target' | 'neighbor' | null;

/**
 * 沙盒連線懸停與機台延遲聚焦狀態 Hook
 * 1. 懸停連線：0ms 立即點亮連線與兩端機台（供料端綠/接收端青）；350ms 延遲啟動背景焦點過濾（其餘機台淡化）。
 * 2. 懸停機台：350ms 延遲啟動反向關聯高亮（直連管線與鄰近機台發光，其餘淡化），防拖曳與快速移動閃爍。
 */
export function useSandboxHover(connections: SandboxConnection[]) {
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [isFocusDimActive, setIsFocusDimActive] = useState<boolean>(false);

  const hoverConnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverNodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 當前懸停的連線物件
  const hoveredConn = useMemo(() => {
    if (!hoveredConnId) return null;
    return connections.find(c => c.id === hoveredConnId) || null;
  }, [hoveredConnId, connections]);

  // 當機台被聚焦時，直接相連的鄰居節點集合
  const inspectedNeighbors = useMemo(() => {
    if (!inspectedNodeId) return new Set<string>();
    const neighbors = new Set<string>();
    connections.forEach(c => {
      if (c.fromNodeId === inspectedNodeId) neighbors.add(c.toNodeId);
      if (c.toNodeId === inspectedNodeId) neighbors.add(c.fromNodeId);
    });
    return neighbors;
  }, [inspectedNodeId, connections]);

  // 懸停連線回呼 (即時變色 + 500ms 延遲暗化背景)
  const handleHoverConnection = useCallback((connId: string | null) => {
    if (hoverConnTimerRef.current) {
      clearTimeout(hoverConnTimerRef.current);
      hoverConnTimerRef.current = null;
    }

    setHoveredConnId(connId);

    if (connId) {
      hoverConnTimerRef.current = setTimeout(() => {
        setIsFocusDimActive(true);
      }, 500);
    } else {
      setIsFocusDimActive(false);
    }
  }, []);

  // 懸停機台回呼 (500ms 延遲啟動反向關聯高亮，防誤觸)
  const handleNodeMouseEnter = useCallback((nodeId: string) => {
    if (hoverNodeTimerRef.current) {
      clearTimeout(hoverNodeTimerRef.current);
      hoverNodeTimerRef.current = null;
    }

    hoverNodeTimerRef.current = setTimeout(() => {
      setInspectedNodeId(nodeId);
      setIsFocusDimActive(true);
    }, 500);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    if (hoverNodeTimerRef.current) {
      clearTimeout(hoverNodeTimerRef.current);
      hoverNodeTimerRef.current = null;
    }
    setInspectedNodeId(null);
    setIsFocusDimActive(false);
  }, []);

  // 計算指定節點的高亮發光模式
  const getNodeGlowMode = useCallback((nodeId: string): NodeGlowMode => {
    if (hoveredConn) {
      if (nodeId === hoveredConn.fromNodeId) return 'source';
      if (nodeId === hoveredConn.toNodeId) return 'target';
    } else if (inspectedNodeId) {
      if (nodeId === inspectedNodeId) return 'source';
      if (inspectedNeighbors.has(nodeId)) return 'neighbor';
    }
    return null;
  }, [hoveredConn, inspectedNodeId, inspectedNeighbors]);

  // 判斷指定節點是否應被淡化過濾
  const isNodeDimmed = useCallback((nodeId: string): boolean => {
    if (!isFocusDimActive) return false;
    const glow = getNodeGlowMode(nodeId);
    return !glow && nodeId !== inspectedNodeId;
  }, [isFocusDimActive, getNodeGlowMode, inspectedNodeId]);

  return {
    hoveredConnId,
    inspectedNodeId,
    isFocusDimActive,
    handleHoverConnection,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    getNodeGlowMode,
    isNodeDimmed
  };
}
