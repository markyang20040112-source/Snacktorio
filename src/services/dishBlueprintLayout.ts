import { SandboxNodeData, SandboxConnection } from '../components/Sandbox/sandboxTypes';

/**
 * 自動化沙盒藍圖階層佈局引擎 (Hierarchical Tier & Port-Lane Layout)
 * 嚴格落實三大幾何排版鐵律：
 * 1. 加工層級決定 X 軸位置 (原料 Tier 0 ➔ 初級加工 ➔ 次級加工 ➔ 終端廚師機，向右流動)
 * 2. 機器輸入端口順序決定後方供給機器的 Y 軸位置 (每個輸入端口定義獨立專屬橫向 Lane，內部嚴格遞迴對齊)
 * 3. 生成時方塊 100% 零重疊 (每列、每通道、環境流體與電網均具備充足防碰撞間距)
 */
/**
 * 精確估算節點實體渲染卡片高度 (確保自訂比例分流器、帶警告機台與多端口設備具備充足防重疊間距)
 */
export function getNodeVisualHeight(node: SandboxNodeData): number {
  if (node.type === 'splitter') {
    return node.splitterMode === 'custom' ? 440 : 280;
  }
  if (node.machineName === '自動廚師機') {
    return 380;
  }
  if (node.type === 'generator') {
    return 245;
  }
  if (node.type === 'pump' || node.type === 'environment_pool') {
    return 220;
  }
  const portCount = Math.max(node.inputs.length, node.outputs.length);
  const hasWarnings = (node.efficiency < 1.0) || node.inputs.some(p => p.isDeficit) || !!node.statusNote;
  return Math.max(260, 200 + portCount * 28 + (hasWarnings ? 55 : 0));
}

export function applyHierarchicalLayout(
  nodes: SandboxNodeData[],
  connections: SandboxConnection[]
): void {
  const COL_WIDTH = 380;
  const ROW_HEIGHT = 360;
  const LANE_GAP = 60;

  // 1. 全廠設備分類：環境流體基建、集中發電電網、主產線機台、胃復慘機台
  const envNodes = nodes.filter(n =>
    (n.type === 'environment_pool' || n.id.startsWith('pool-') || n.id.startsWith('pump-') || n.id.startsWith('sludge-manip-')) &&
    !n.id.startsWith('pump-trans-')
  );
  const powerNodes = nodes.filter(n => n.type === 'generator' || n.id.startsWith('pwr-coal'));
  const allProdNodes = nodes.filter(n => !envNodes.includes(n) && !powerNodes.includes(n));

  const mainProdNodes = allProdNodes.filter(n => !n.isAutoPepto);
  const remedyProdNodes = allProdNodes.filter(n => !!n.isAutoPepto);

  // ─────────────────────────────────────────────────────────────
  // 1. 【液體系統】(左側縱向側欄 / 後端補給區，全廠統一集中供液)
  // ─────────────────────────────────────────────────────────────
  let envMaxX = 60;
  let envMaxY = 80;

  if (envNodes.length > 0) {
    let curEnvY = 80;
    const poolNodes = envNodes.filter(n => n.type === 'environment_pool');

    poolNodes.forEach(pool => {
      pool.x = 60;
      pool.y = curEnvY;

      const pump = envNodes.find(n => n.type === 'pump' && connections.some(c => c.fromNodeId === pool.id && c.toNodeId === n.id));
      const sludgeManip = pump ? envNodes.find(n => n.machineName === '物質操縱機' && connections.some(c => c.fromNodeId === n.id && c.toNodeId === pump.id)) : null;

      if (pump) {
        pump.x = 60 + COL_WIDTH;
        pump.y = curEnvY;

        if (sludgeManip) {
          // 將物質操縱機置於第 1 欄 (pool 正下方)，形成優雅的並聯回路：
          // 1. pool (左) ➔ pump (右)：水平直通
          // 2. sludgeManip (左) ➔ pump (右)：順向直供汙泥 (由左至右)，徹底消除同欄逆向繞線
          // 3. pump (右上) ➔ sludgeManip (左下)：流體自耗回饋線經由下方外側走廊清晰注入
          sludgeManip.x = 60;
          sludgeManip.y = curEnvY + 280;
        }
      }

      const poolHeight = sludgeManip ? (280 + 220) : 220;
      curEnvY += poolHeight + 60;
    });

    envMaxX = 60 + COL_WIDTH * 2;
    envMaxY = curEnvY;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 【產線區域】(右上側區塊：主料理產線 + 胃復慘中和產線)
  // ─────────────────────────────────────────────────────────────
  const prodStartX = envNodes.length > 0 ? (envMaxX + 60) : 60;

  // 定義單條產線排版核心邏輯 (階層逆向推導 + 下游輸入端口 Y 軸通道對齊)
  const layoutProductionLine = (prodNodes: SandboxNodeData[], startX: number): { maxX: number; maxY: number } => {
    if (prodNodes.length === 0) return { maxX: startX, maxY: 80 };

    const chefNode = prodNodes.find(n => n.machineName === '自動廚師機');
    const nodeMap = new Map<string, SandboxNodeData>(prodNodes.map(n => [n.id, n]));

    const inConnsMap = new Map<string, SandboxConnection[]>();
    connections.forEach(c => {
      if (!inConnsMap.has(c.toNodeId)) inConnsMap.set(c.toNodeId, []);
      inConnsMap.get(c.toNodeId)!.push(c);
    });

    const primaryOutsMap = new Map<string, string[]>();
    const baseOutsMap = new Map<string, string[]>();
    prodNodes.forEach(n => {
      primaryOutsMap.set(n.id, []);
      baseOutsMap.set(n.id, []);
    });

    connections.forEach(c => {
      if (nodeMap.has(c.fromNodeId) && nodeMap.has(c.toNodeId)) {
        const isBaseRefill = c.toPortId === 'in-base' || c.toPortId.includes('base') || c.toPortId.includes('底料') || c.id.includes('surplus-base') || c.id.includes('heal-base');
        if (isBaseRefill) {
          baseOutsMap.get(c.fromNodeId)!.push(c.toNodeId);
        } else {
          primaryOutsMap.get(c.fromNodeId)!.push(c.toNodeId);
        }
      }
    });

    const distMap = new Map<string, number>();
    if (chefNode) {
      distMap.set(chefNode.id, 0);
    }

    const visiting = new Set<string>();
    const getDistFromSink = (nodeId: string): number => {
      if (distMap.has(nodeId)) return distMap.get(nodeId)!;
      if (visiting.has(nodeId)) return 1;
      visiting.add(nodeId);

      const primaryOuts = primaryOutsMap.get(nodeId) || [];
      const baseOuts = baseOutsMap.get(nodeId) || [];
      const outs = primaryOuts.length > 0 ? primaryOuts : baseOuts;

      if (outs.length === 0) {
        visiting.delete(nodeId);
        distMap.set(nodeId, 0);
        return 0;
      }

      let maxDist = 0;
      for (const nextId of outs) {
        const d = getDistFromSink(nextId);
        if (d + 1 > maxDist) maxDist = d + 1;
      }

      visiting.delete(nodeId);
      distMap.set(nodeId, maxDist);
      return maxDist;
    };

    prodNodes.forEach(n => getDistFromSink(n.id));

    let maxDist = 0;
    prodNodes.forEach(n => {
      const d = distMap.get(n.id) || 0;
      if (d > maxDist) maxDist = d;
    });

    const tierMap = new Map<string, number>();
    prodNodes.forEach(n => {
      const d = distMap.get(n.id) || 0;
      tierMap.set(n.id, maxDist - d);
    });

    const maxProdTier = maxDist;

    // 依下游機器輸入端口順序分配 Y 軸通道 (Port-Lanes)
    const laneMap = new Map<string, number>();
    const ySubRankMap = new Map<string, number>();

    if (chefNode) {
      const chefInputs = chefNode.inputs.filter(p => p.name && p.name !== '無');

      chefInputs.forEach((inPort, laneIdx) => {
        const conns = (inConnsMap.get(chefNode.id) || []).filter(c => c.toPortId === inPort.id && nodeMap.has(c.fromNodeId));
        const queue: { id: string; subRank: number }[] = conns.map((c, idx) => ({ id: c.fromNodeId, subRank: idx * 10 }));
        const visitedInLane = new Set<string>();

        while (queue.length > 0) {
          const { id: curId, subRank } = queue.shift()!;
          if (visitedInLane.has(curId)) continue;
          visitedInLane.add(curId);

          if (!laneMap.has(curId)) {
            laneMap.set(curId, laneIdx);
            ySubRankMap.set(curId, subRank);
          }

          const curNode = nodeMap.get(curId);
          if (!curNode) continue;

          curNode.inputs.forEach((p, pIdx) => {
            const upConns = (inConnsMap.get(curId) || []).filter(c => c.toPortId === p.id && nodeMap.has(c.fromNodeId));
            upConns.forEach((uc, cIdx) => {
              queue.push({
                id: uc.fromNodeId,
                subRank: subRank * 100 + pIdx * 10 + cIdx
              });
            });
          });
        }
      });
    }

    // 備用通道 (未被連線追蹤到的孤立節點)
    const fallbackLane = (chefNode?.inputs.length || 1);
    prodNodes.forEach(n => {
      if (n !== chefNode && !laneMap.has(n.id)) {
        laneMap.set(n.id, fallbackLane);
        ySubRankMap.set(n.id, 9999);
      }
    });

    // 排版各通道之製程機台 (充足防碰撞間距)
    let curLaneY = 80;
    const totalLanes = chefNode ? (chefNode.inputs.length + 1) : 1;

    for (let l = 0; l <= totalLanes; l++) {
      const nodesInLane = prodNodes.filter(n => n !== chefNode && laneMap.get(n.id) === l);
      if (nodesInLane.length === 0) continue;

      const colsInLane = new Map<number, SandboxNodeData[]>();
      nodesInLane.forEach(n => {
        const t = tierMap.get(n.id) || 0;
        if (!colsInLane.has(t)) colsInLane.set(t, []);
        colsInLane.get(t)!.push(n);
      });

      let maxRowsInLane = 1;
      colsInLane.forEach(colNodes => {
        if (colNodes.length > maxRowsInLane) maxRowsInLane = colNodes.length;
      });

      // 先對每欄節點依 Y 軸次序 (ySubRank) 排序，使第 r 列精確對應到實際渲染之節點
      colsInLane.forEach(colNodes => {
        colNodes.sort((a, b) => (ySubRankMap.get(a.id) || 0) - (ySubRankMap.get(b.id) || 0));
      });

      // 自適應計算該通道內每一排 (Row) 的 Y 座標與高度（保證高卡片如自訂分流器 440px 不壓到下方卡片，留足 60px 間距）
      const rowYOffsets: number[] = [];
      let accumulatedY = curLaneY;
      for (let r = 0; r < maxRowsInLane; r++) {
        rowYOffsets.push(accumulatedY);
        const rowNodes = Array.from(colsInLane.values()).map(col => col[r]).filter(Boolean);
        const maxRowH = Math.max(ROW_HEIGHT - 60, ...rowNodes.map(n => getNodeVisualHeight(n)));
        accumulatedY += maxRowH + 60;
      }
      const laneHeight = accumulatedY - curLaneY;

      colsInLane.forEach((colNodes, t) => {
        const colX = startX + t * COL_WIDTH;

        colNodes.forEach((node, rIdx) => {
          node.x = colX;
          node.y = rowYOffsets[rIdx];
        });
      });

      curLaneY += laneHeight + LANE_GAP;
    }

    // 終端廚師機置於最右側欄位，垂直置中於各通道中央
    const maxLineX = startX + maxProdTier * COL_WIDTH;
    if (chefNode) {
      chefNode.x = maxLineX;
      chefNode.y = Math.max(80, Math.round((80 + curLaneY - ROW_HEIGHT) / 2));
    }

    return {
      maxX: maxLineX + COL_WIDTH,
      maxY: curLaneY
    };
  };

  // 排版主料理產線
  const mainBounds = layoutProductionLine(mainProdNodes, prodStartX);
  let maxProdX = mainBounds.maxX;
  let maxProdY = mainBounds.maxY;

  // 若附帶中和解毒配產模組（胃復慘），緊鄰主產線右側平整展開
  if (remedyProdNodes.length > 0) {
    const remedyBounds = layoutProductionLine(remedyProdNodes, mainBounds.maxX + 100);
    maxProdX = remedyBounds.maxX;
    maxProdY = Math.max(maxProdY, remedyBounds.maxY);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 【電力系統】(產線與液體系統正下方，橫向展開 Power Cells)
  // ─────────────────────────────────────────────────────────────
  const coalMiners = powerNodes.filter(n => n.id.startsWith('pwr-coal'));
  const furnaces = powerNodes.filter(n => n.type === 'generator');

  const pwrStartY = Math.max(maxProdY, envMaxY) + 60;
  const pwrStartX = prodStartX;

  // 每排最多並排單元數 (依上方產線總寬自適應，每單元佔 2 欄寬度)
  const prodCols = Math.max(4, Math.floor((maxProdX - pwrStartX) / COL_WIDTH));
  const unitsPerRow = Math.max(2, Math.floor(prodCols / 2));

  // 依真實連線關係 (Connections-driven) 綁定採煤機與其連線供給之熔爐
  const minerFurnacesMap = new Map<string, SandboxNodeData[]>();
  const assignedFurnaceIds = new Set<string>();

  coalMiners.forEach(miner => {
    const targetFurnaces: SandboxNodeData[] = [];
    connections.forEach(c => {
      if (c.fromNodeId === miner.id && (c.toPortId === 'in-coal' || miner.outputs.some(o => o.id === c.fromPortId))) {
        const fn = furnaces.find(f => f.id === c.toNodeId);
        if (fn && !assignedFurnaceIds.has(fn.id)) {
          targetFurnaces.push(fn);
          assignedFurnaceIds.add(fn.id);
        }
      }
    });
    minerFurnacesMap.set(miner.id, targetFurnaces);
  });

  // 防禦性：未連線的熔爐依序補充分配至尚未滿 2 台的採煤機
  const unassignedFurnaces = furnaces.filter(f => !assignedFurnaceIds.has(f.id));
  coalMiners.forEach(miner => {
    const list = minerFurnacesMap.get(miner.id)!;
    while (list.length < 2 && unassignedFurnaces.length > 0) {
      list.push(unassignedFurnaces.shift()!);
    }
  });

  coalMiners.forEach((miner, mIdx) => {
    const rowIdx = Math.floor(mIdx / unitsPerRow);
    const colInRow = mIdx % unitsPerRow;

    const unitX = pwrStartX + colInRow * 2 * COL_WIDTH;
    const unitY = pwrStartY + rowIdx * (245 * 2 + 40);

    // 採煤機置於單元左欄中央
    miner.x = unitX;
    miner.y = unitY + 120;

    // 該採煤機連線供給之 1~2 台熔爐排列於右欄上下 (同單元水平直連，零交叉)
    const list = minerFurnacesMap.get(miner.id) || [];
    const f1 = list[0];
    const f2 = list[1];

    if (f1) {
      f1.x = unitX + COL_WIDTH;
      f1.y = unitY;
    }
    if (f2) {
      f2.x = unitX + COL_WIDTH;
      f2.y = unitY + 245;
    }
  });

  // 極端防禦：若仍有多餘未分配熔爐，自適應排列於額外欄位，確保絕對不重疊
  if (unassignedFurnaces.length > 0) {
    unassignedFurnaces.forEach((f, idx) => {
      const uIdx = coalMiners.length + Math.floor(idx / 2);
      const rowIdx = Math.floor(uIdx / unitsPerRow);
      const colInRow = uIdx % unitsPerRow;
      const unitX = pwrStartX + colInRow * 2 * COL_WIDTH;
      const unitY = pwrStartY + rowIdx * (245 * 2 + 40);
      f.x = unitX + COL_WIDTH;
      f.y = (idx % 2 === 0) ? unitY : unitY + 245;
    });
  }
}
