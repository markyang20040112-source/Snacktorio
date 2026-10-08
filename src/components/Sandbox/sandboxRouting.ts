import { SandboxNodeData } from './sandboxTypes';

export interface Point {
  x: number;
  y: number;
}

/**
 * 取得節點實體碰撞邊界（AABB 帶安全邊距）
 */
function getNodeBounds(node: SandboxNodeData) {
  const width = 288;
  let estimatedHeight = 220;
  if (node.machineName === '自動廚師機') {
    estimatedHeight = 350;
  } else if (node.type === 'splitter') {
    estimatedHeight = node.splitterMode === 'custom' ? 260 : 190;
  } else if (node.type === 'pump' || node.type === 'environment_pool') {
    estimatedHeight = 220;
  } else {
    const portCount = Math.max(node.inputs.length, node.outputs.length);
    estimatedHeight = 210 + portCount * 26 + (node.efficiency < 1 ? 55 : 0);
  }

  return {
    left: node.x - 8,
    right: node.x + width + 8,
    top: node.y - 8,
    bottom: node.y + estimatedHeight + 8
  };
}

/**
 * 將正交折線點陣列轉換為圓角 SVG 路徑 (Quadratic Bezier 圓弧導角)
 */
function pointsToSvgPath(points: Point[], maxR = 12): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  // 移除相鄰重複點或微小共線冗餘點
  const pts: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = pts[pts.length - 1];
    const curr = points[i];
    if (Math.abs(prev.x - curr.x) > 0.5 || Math.abs(prev.y - curr.y) > 0.5) {
      pts.push(curr);
    }
  }

  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];

    const dIn = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
    const dOut = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y);

    const r = Math.min(maxR, dIn / 2, dOut / 2);

    if (r < 2) {
      d += ` L ${pCurr.x} ${pCurr.y}`;
      continue;
    }

    const vxIn = (pCurr.x - pPrev.x) / dIn;
    const vyIn = (pCurr.y - pPrev.y) / dIn;

    const vxOut = (pNext.x - pCurr.x) / dOut;
    const vyOut = (pNext.y - pCurr.y) / dOut;

    const tBeforeX = pCurr.x - vxIn * r;
    const tBeforeY = pCurr.y - vyIn * r;

    const tAfterX = pCurr.x + vxOut * r;
    const tAfterY = pCurr.y + vyOut * r;

    d += ` L ${tBeforeX.toFixed(1)} ${tBeforeY.toFixed(1)}`;
    d += ` Q ${pCurr.x.toFixed(1)} ${pCurr.y.toFixed(1)}, ${tAfterX.toFixed(1)} ${tAfterY.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  return d;
}

export interface RoutingOptions {
  slotOffset?: number;
  isFluid?: boolean;
  fluidName?: string;
  preferBelow?: boolean;
  corridorTrack?: number;
}

/**
 * 智慧正交圓角走線引擎 (Smart Orthogonal Conduit Routing)
 * 解決痛點：
 * 1. 跨階層長距離連線切穿中間方塊肚子（如流體水管橫穿中間多台機器）
 * 2. 多條線垂直槽位重疊（如多台採掘機直供廚師機時共用同條 midX 垂直線）
 * 3. 虛空與水管長距離走線重疊（虛空優先走機台下方通道，水管走上方，且同向多管獨立軌道分流）
 * 4. 同欄位上下直供斜切穿透下方機台
 */
export function computeOrthogonalPath(
  start: Point,
  end: Point,
  fromNode?: SandboxNodeData,
  toNode?: SandboxNodeData,
  allNodes?: SandboxNodeData[],
  options: number | RoutingOptions = 0
): string {
  const opts: RoutingOptions = typeof options === 'number'
    ? { slotOffset: options }
    : (options || {});
  const slotOffset = opts.slotOffset || 0;
  const corridorTrack = opts.corridorTrack || 0;

  // 1. 同水平高度且無任何障礙
  if (Math.abs(start.y - end.y) < 2 && end.x >= start.x) {
    const hasObstacle = (allNodes || []).some(n => {
      if (n.id === fromNode?.id || n.id === toNode?.id) return false;
      const b = getNodeBounds(n);
      return b.left < end.x && b.right > start.x && start.y >= b.top && start.y <= b.bottom;
    });
    if (!hasObstacle) {
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }
  }

  // 2. 收集位於 start 與 end 水平跨度之間的中間節點障礙物
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const intermediateObstacles = (allNodes || []).filter(n => {
    if (n.id === fromNode?.id || n.id === toNode?.id) return false;
    const b = getNodeBounds(n);
    // 橫向重疊於路徑中段
    return b.right > minX + 16 && b.left < maxX - 16;
  });

  // 3. 常規順向由左至右 (Target 在 Source 右側且距離充裕)
  if (end.x >= start.x + 36) {
    const midX = Math.max(
      start.x + 16,
      Math.min(end.x - 16, (start.x + end.x) / 2 + slotOffset)
    );

    // 檢查簡單 2-Bend 路徑（start.y 橫向 -> midX 直向 -> end.y 橫向）是否會切穿任何中間機台
    const hitsObstacle = intermediateObstacles.some(n => {
      const b = getNodeBounds(n);
      // 檢查橫向段 1 [start.x, midX] at start.y
      if (start.y >= b.top && start.y <= b.bottom && Math.max(start.x, b.left) <= Math.min(midX, b.right)) {
        return true;
      }
      // 檢查橫向段 2 [midX, end.x] at end.y
      if (end.y >= b.top && end.y <= b.bottom && Math.max(midX, b.left) <= Math.min(end.x, b.right)) {
        return true;
      }
      // 檢查垂直段 at midX
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      if (midX >= b.left && midX <= b.right && Math.max(minY, b.top) <= Math.min(maxY, b.bottom)) {
        return true;
      }
      return false;
    });

    if (!hitsObstacle) {
      // 無障礙物直通：採用帶槽位偏移的乾淨 2-Bend 圓角折線（消除同欄多線重疊）
      return pointsToSvgPath([
        start,
        { x: midX, y: start.y },
        { x: midX, y: end.y },
        end
      ], 16);
    }

    // ★ 有障礙物阻擋（如水管/虛空管長距橫越中間整排機台）：
    // 啟動 4-Bend 行間安全通道避障繞道 (Safe Corridor Detour)！
    // 找出在路徑 Y 軸區間附近實際阻擋的中間機台群 (避免誤納入遠在下方數百像素外的獨立電網)
    const pathTop = Math.min(start.y, end.y) - 40;
    const pathBottom = Math.max(start.y, end.y) + 40;
    const blockingObstacles = intermediateObstacles.filter(n => {
      const b = getNodeBounds(n);
      return b.bottom >= pathTop && b.top <= pathBottom;
    });

    const relevantObstacles = blockingObstacles.length > 0 ? blockingObstacles : intermediateObstacles;
    const blockBottom = Math.max(...relevantObstacles.map(n => getNodeBounds(n).bottom));
    const blockTop = Math.min(...relevantObstacles.map(n => getNodeBounds(n).top));

    // 判斷走線通道：
    // 1. 若為虛空 (Void) 流體或明確指定 preferBelow，優先走機台群下方安全通道 (直接就近銜接機台下方的虛空輸入端口)
    // 2. 否則依折返垂直距離遠近選取上方或下方通道
    const isVoid = opts.fluidName === '虛空' || (fromNode?.recipeName === '虛空' || fromNode?.title.includes('虛空'));
    const distAbove = Math.abs(start.y - blockTop) + Math.abs(end.y - blockTop);
    const distBelow = Math.abs(start.y - blockBottom) + Math.abs(end.y - blockBottom);

    const preferBelow = opts.preferBelow ?? (isVoid ? true : distBelow < distAbove - 50);

    const trackGap = 18; // 多線並行獨立軌道間距 (徹底杜絕同向線條重疊)
    const corridorY = preferBelow
      ? blockBottom + 22 + corridorTrack * trackGap
      : Math.max(20, blockTop - 22 - corridorTrack * trackGap);

    // 起點右側安全出線槽與終點左側安全入線槽 (依軌道微調展開，杜絕垂直段重疊)
    const x1 = Math.max(
      start.x + 16,
      (fromNode ? getNodeBounds(fromNode).right + 14 : start.x + 24) + slotOffset * 0.4 + corridorTrack * 6
    );
    const x2 = Math.min(
      end.x - 16,
      (toNode ? getNodeBounds(toNode).left - 14 : end.x - 24) + slotOffset * 0.4 + corridorTrack * 6
    );

    return pointsToSvgPath([
      start,
      { x: x1, y: start.y },
      { x: x1, y: corridorY },
      { x: x2, y: corridorY },
      { x: x2, y: end.y },
      end
    ], 16);
  }

  // 4. 同欄位垂直連線或逆向回補 (Target 在 Source 左方、或同欄位垂直向下/向上)
  const fromRight = (fromNode ? getNodeBounds(fromNode).right + 14 : start.x + 24) + slotOffset * 0.4;
  const toLeft = (toNode ? getNodeBounds(toNode).left - 14 : end.x - 24) - slotOffset * 0.4;

  let gapY: number;
  if (end.y > start.y) {
    // 向下走線：走兩機台間的行間空隙
    const fromBottom = fromNode ? getNodeBounds(fromNode).bottom : (start.y + 30);
    const toTop = toNode ? getNodeBounds(toNode).top : (end.y - 30);
    if (toTop > fromBottom) {
      gapY = (fromBottom + toTop) / 2 + slotOffset * 0.3;
    } else {
      gapY = Math.max(start.y + 30, (start.y + end.y) / 2) + slotOffset * 0.3;
    }
  } else {
    // 向上走線 (逆向回補)：繞經上方通道
    const toBottom = toNode ? getNodeBounds(toNode).bottom : (end.y + 30);
    const fromTop = fromNode ? getNodeBounds(fromNode).top : (start.y - 30);
    if (fromTop > toBottom) {
      gapY = (fromTop + toBottom) / 2 + slotOffset * 0.3;
    } else {
      gapY = Math.min(start.y - 30, (start.y + end.y) / 2) + slotOffset * 0.3;
    }
  }

  // 檢查橫向跨越段是否會切穿同欄中的其它中間機台
  const hasMiddleObstacle = (allNodes || []).some(n => {
    if (n.id === fromNode?.id || n.id === toNode?.id) return false;
    const b = getNodeBounds(n);
    return gapY >= b.top && gapY <= b.bottom && Math.max(toLeft, b.left) <= Math.min(fromRight, b.right);
  });

  if (hasMiddleObstacle) {
    const sameColObs = (allNodes || []).filter(n =>
      n.id !== fromNode?.id &&
      n.id !== toNode?.id &&
      Math.max(toLeft, getNodeBounds(n).left) <= Math.min(fromRight, getNodeBounds(n).right)
    );
    if (sameColObs.length > 0) {
      const maxColBottom = Math.max(...sameColObs.map(n => getNodeBounds(n).bottom));
      gapY = maxColBottom + 20 + Math.abs(slotOffset);
    }
  }

  return pointsToSvgPath([
    start,
    { x: fromRight, y: start.y },
    { x: fromRight, y: gapY },
    { x: toLeft, y: gapY },
    { x: toLeft, y: end.y },
    end
  ], 12);
}
