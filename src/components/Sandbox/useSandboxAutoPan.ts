import React, { useRef, useEffect, useCallback } from 'react';
import { ConnectingSource } from './SandboxConnectionsLayer';

interface UseSandboxAutoPanProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  zoom: number;
  connectingSource: ConnectingSource | null;
  setConnectingSource: React.Dispatch<React.SetStateAction<ConnectingSource | null>>;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  setDraggingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
}

/** 畫布邊緣自動推鏡頭 (Auto-Pan) 與滑鼠全域釋放監聽 */
export function useSandboxAutoPan({
  canvasRef,
  pan,
  setPan,
  zoom,
  connectingSource,
  setConnectingSource,
  setIsPanning,
  setDraggingNodeId
}: UseSandboxAutoPanProps) {
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const connectingSourceRef = useRef(connectingSource);
  connectingSourceRef.current = connectingSource;

  const autoPanVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const autoPanAnimationRef = useRef<number | null>(null);
  const lastMousePosRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });

  const stopAutoPan = useCallback(() => {
    if (autoPanAnimationRef.current) {
      cancelAnimationFrame(autoPanAnimationRef.current);
      autoPanAnimationRef.current = null;
    }
    autoPanVelocityRef.current = { vx: 0, vy: 0 };
  }, []);

  const startAutoPan = useCallback(() => {
    if (autoPanAnimationRef.current) return;

    const loop = () => {
      const { vx, vy } = autoPanVelocityRef.current;
      if (vx === 0 && vy === 0) {
        autoPanAnimationRef.current = null;
        return;
      }

      // 平移狀態以純函式 updater 累加；拉線端點更新移出 updater (避免於 updater 內產生副作用)，改以 panRef 追蹤之下一幀位置計算
      const nextX = panRef.current.x + vx;
      const nextY = panRef.current.y + vy;
      panRef.current = { x: nextX, y: nextY };
      setPan(prev => ({ x: prev.x + vx, y: prev.y + vy }));

      if (connectingSourceRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const { clientX, clientY } = lastMousePosRef.current;
        const curX = (clientX - rect.left - nextX) / zoomRef.current;
        const curY = (clientY - rect.top - nextY) / zoomRef.current;
        setConnectingSource(prevSrc => prevSrc ? {
          ...prevSrc,
          currentX: curX,
          currentY: curY
        } : null);
      }

      autoPanAnimationRef.current = requestAnimationFrame(loop);
    };

    autoPanAnimationRef.current = requestAnimationFrame(loop);
  }, [canvasRef, setPan, setConnectingSource]);

  const handleEdgeAutoPan = useCallback((e: React.MouseEvent, active: boolean) => {
    if (!active || !canvasRef.current) {
      stopAutoPan();
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const margin = 80;
    const maxSpeed = 15;

    let vx = 0;
    let vy = 0;

    if (mouseX >= 0 && mouseX < margin) {
      vx = maxSpeed * Math.pow((margin - mouseX) / margin, 1.2);
    } else if (mouseX <= rect.width && mouseX > rect.width - margin) {
      vx = -maxSpeed * Math.pow((margin - (rect.width - mouseX)) / margin, 1.2);
    }

    if (mouseY >= 0 && mouseY < margin) {
      vy = maxSpeed * Math.pow((margin - mouseY) / margin, 1.2);
    } else if (mouseY <= rect.height && mouseY > rect.height - margin) {
      vy = -maxSpeed * Math.pow((margin - (rect.height - mouseY)) / margin, 1.2);
    }

    autoPanVelocityRef.current = { vx, vy };

    if ((vx !== 0 || vy !== 0) && !autoPanAnimationRef.current) {
      startAutoPan();
    } else if (vx === 0 && vy === 0 && autoPanAnimationRef.current) {
      stopAutoPan();
    }
  }, [canvasRef, startAutoPan, stopAutoPan]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      stopAutoPan();
      setIsPanning(false);
      setDraggingNodeId(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', stopAutoPan);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', stopAutoPan);
      stopAutoPan();
    };
  }, [stopAutoPan, setIsPanning, setDraggingNodeId]);

  return {
    lastMousePosRef,
    panRef,
    zoomRef,
    handleEdgeAutoPan,
    stopAutoPan
  };
}
