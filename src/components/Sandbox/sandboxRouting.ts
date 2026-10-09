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
    estimatedHeight = 360;
  } else if (node.type === 'splitter') {
    estimatedHeight = node.splitterMode === 'custom' ? 440 : 280;
  } else if (node.type === 'pump' || node.type === 'environment_pool') {
    estimatedHeight = 220;
  } else {
    const portCount = Math.max(node.inputs.length, node.outputs.length);
    const hasWarnings = (node.efficiency < 1.0) || node.inputs.some(p => p.isDeficit) || !!node.statusNote;
    estimatedHeight = Math.max(220, 180 + portCount * 28 + (hasWarnings ? 55 : 0));
  }

  return {
    left: node.x - 12,
    right: node.x + width + 12,
    top: node.y - 12,
    bottom: node.y + estimatedHeight + 16
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
 * 檢查水平線段 [x1, x2] 在高度 y 是否與任何非忽略節點發生碰撞
 */
function isHorizontalSegmentClear(
  y: number,
  x1: number,
  x2: number,
  allNodes: SandboxNodeData[],
  ignoreIds: Set<string>
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return !allNodes.some(n => {
    if (ignoreIds.has(n.id)) return false;
    const b = getNodeBounds(n);
    return y >= b.top && y <= b.bottom && maxX >= b.left && minX <= b.right;
  });
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

  const ignoreIds = new Set<string>();
  if (fromNode) ignoreIds.add(fromNode.id);
  if (toNode) ignoreIds.add(toNode.id);

  // 1. 同水平高度且無任何障礙
  if (Math.abs(start.y - end.y) < 2 && end.x >= start.x) {
    const hasObstacle = (allNodes || []).some(n => {
      if (ignoreIds.has(n.id)) return false;
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
    if (ignoreIds.has(n.id)) return false;
    const b = getNodeBounds(n);
    // 橫向重疊於路徑中段
    return b.right > minX + 16 && b.left < maxX - 16;
  });

  // 3. 常規順向由左至右 (Target 在 Source 右側且距離充裕)
  if (end.x >= start.x + 36) {
    const midX = Math.max(
      start.x + 16,
      Math.min(end.x - 24, (start.x + end.x) / 2 + slotOffset)
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

    // ★ 有障礙物阻擋（如水管/紅油/虛空管長距橫越中間整排機台）：
    // 啟動 4-Bend 行間安全通道避障繞道 (Safe Corridor Detour)！
    // 1. 取得在 [x1, x2] 跨度內真正會阻擋的中介節點
    const trackGap = 16;
    const offset = 22 + corridorTrack * trackGap;

    // 起點右側安全出線槽與終點左側安全入線槽 (軌道間距放寬至 20px，徹底拉開 X 軸間距，杜絕黏合重疊)
    const TRACK_GAP_X = 20;
    const x1 = Math.max(
      start.x + 16,
      (fromNode ? getNodeBounds(fromNode).right + 16 : start.x + 24) + corridorTrack * TRACK_GAP_X + slotOffset * 0.5
    );
    const x2 = Math.min(
      end.x - 24,
      (toNode ? getNodeBounds(toNode).left - 16 : end.x - 28) - corridorTrack * TRACK_GAP_X - slotOffset * 0.5
    );

    const minSpanX = Math.min(x1, x2);
    const maxSpanX = Math.max(x1, x2);
    const blockingObstacles = intermediateObstacles
      .filter(n => {
        const b = getNodeBounds(n);
        return b.right >= minSpanX && b.left <= maxSpanX;
      })
      .sort((a, b) => getNodeBounds(a).top - getNodeBounds(b).top);

    const candidateList: number[] = [];

    // 2. 優先探索「機台之間的水平行間通道」(Inter-row Gaps)
    //    如採收辣椒與烘烤灰燼之間的間隙，直接走最短橫向通道，杜絕無謂折返！
    for (let i = 0; i < blockingObstacles.length - 1; i++) {
      const b1 = getNodeBounds(blockingObstacles[i]);
      const b2 = getNodeBounds(blockingObstacles[i + 1]);
      const gapHeight = b2.top - b1.bottom;
      if (gapHeight >= 16) {
        const gapCenter = (b1.bottom + b2.top) / 2;
        const trackY = Math.max(
          b1.bottom + 8,
          Math.min(b2.top - 8, gapCenter + corridorTrack * 8)
        );
        candidateList.push(trackY);
      }
    }

    // 3. 障礙物群頂部與底部外緣通道
    if (blockingObstacles.length > 0) {
      const blockTop = Math.min(...blockingObstacles.map(n => getNodeBounds(n).top));
      const blockBottom = Math.max(...blockingObstacles.map(n => getNodeBounds(n).bottom));
      candidateList.push(Math.max(20, blockTop - offset));
      candidateList.push(blockBottom + offset);
    }

    // 4. 全廠外緣通道 (安全兜底)
    const allObstacleTop = intermediateObstacles.length > 0
      ? Math.min(...intermediateObstacles.map(n => getNodeBounds(n).top))
      : 80;
    const allObstacleBottom = intermediateObstacles.length > 0
      ? Math.max(...intermediateObstacles.map(n => getNodeBounds(n).bottom))
      : 1200;
    const factoryTop = (allNodes && allNodes.length > 0)
      ? Math.min(...allNodes.map(n => getNodeBounds(n).top))
      : 80;
    const factoryBottom = (allNodes && allNodes.length > 0)
      ? Math.max(...allNodes.map(n => getNodeBounds(n).bottom))
      : 1200;

    candidateList.push(Math.max(20, allObstacleTop - offset));
    candidateList.push(allObstacleBottom + offset);
    candidateList.push(Math.max(20, factoryTop - offset));
    candidateList.push(factoryBottom + offset);

    // 5. 嚴格碰撞檢驗：只保留 100% 水平不穿透任何機台的安全通道
    const clearCandidates = candidateList.filter(y =>
      isHorizontalSegmentClear(y, x1, x2, allNodes || [], ignoreIds)
    );

    // 6. 評分排序：尋找總垂直位移最小、路徑最直接的美觀通道 (虛空優先走下方通道)
    const isVoid = opts.fluidName === '虛空' || (fromNode?.recipeName === '虛空' || fromNode?.title.includes('虛空'));
    const midY = (start.y + end.y) / 2;

    clearCandidates.sort((a, b) => {
      const detourA = Math.abs(a - start.y) + Math.abs(a - end.y);
      const detourB = Math.abs(b - start.y) + Math.abs(b - end.y);

      const voidPenaltyA = (isVoid || opts.preferBelow) && a < midY ? 800 : 0;
      const voidPenaltyB = (isVoid || opts.preferBelow) && b < midY ? 800 : 0;

      const scoreA = detourA * 10 + Math.abs(a - midY) + voidPenaltyA;
      const scoreB = detourB * 10 + Math.abs(b - midY) + voidPenaltyB;

      return scoreA - scoreB;
    });

    const corridorY = clearCandidates.length > 0
      ? clearCandidates[0]
      : (isVoid || opts.preferBelow ? factoryBottom + offset : Math.max(20, factoryTop - offset));

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
  const TRACK_GAP_X = 20;
  const fromRight = (fromNode ? getNodeBounds(fromNode).right + 16 : start.x + 24) + corridorTrack * TRACK_GAP_X + slotOffset * 0.5;
  const toLeft = (toNode ? getNodeBounds(toNode).left - 16 : end.x - 28) - corridorTrack * TRACK_GAP_X - slotOffset * 0.5;

  const fromBottom = fromNode ? getNodeBounds(fromNode).bottom : (start.y + 30);
  const fromTop = fromNode ? getNodeBounds(fromNode).top : (start.y - 30);
  const toBottom = toNode ? getNodeBounds(toNode).bottom : (end.y + 30);
  const toTop = toNode ? getNodeBounds(toNode).top : (end.y - 30);

  let gapY: number;
  if (opts.preferBelow) {
    // 優先走兩者下方的安全走廊 (如虛空等需要走底部的管線，徹底避免在機台間交叉)
    gapY = Math.max(fromBottom, toBottom) + 24 + corridorTrack * 16;
  } else if (end.y > start.y) {
    // 向下走線：檢查兩機台間的縫隙是否足夠充裕 (>= 35px)
    const gapHeight = toTop - fromBottom;
    if (gapHeight >= 35) {
      gapY = (fromBottom + toTop) / 2 + slotOffset * 0.3;
    } else {
      // 縫隙過窄，禁止切穿夾縫，繞經下方安全通道
      gapY = Math.max(fromBottom, toBottom) + 24 + corridorTrack * 16;
    }
  } else {
    // 向上走線 (逆向回補)：
    const gapHeight = fromTop - toBottom;
    if (gapHeight >= 35) {
      gapY = (fromTop + toBottom) / 2 + slotOffset * 0.3;
    } else {
      // 縫隙過窄，繞經上方安全通道
      gapY = Math.min(fromTop, toTop) - 24 - corridorTrack * 16;
    }
  }

  // 檢查橫向跨越段是否會切穿同欄中的其它中間機台
  if (!isHorizontalSegmentClear(gapY, toLeft, fromRight, allNodes || [], ignoreIds)) {
    const candidateGapTop = Math.min(fromTop, toTop) - 24 - corridorTrack * 16;
    const candidateGapBottom = Math.max(fromBottom, toBottom) + 24 + corridorTrack * 16;
    if (opts.preferBelow) {
      gapY = candidateGapBottom;
    } else if (isHorizontalSegmentClear(candidateGapTop, toLeft, fromRight, allNodes || [], ignoreIds)) {
      gapY = candidateGapTop;
    } else {
      gapY = candidateGapBottom;
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
