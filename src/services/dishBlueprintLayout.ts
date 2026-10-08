import { SandboxNodeData, SandboxConnection } from '../components/Sandbox/sandboxTypes';

/**
 * 自動化沙盒藍圖階層佈局引擎 (Hierarchical Tier & Port-Lane Layout)
 * 嚴格落實三大幾何排版鐵律：
 * 1. 加工層級決定 X 軸位置 (原料 Tier 0 ➔ 初級加工 ➔ 次級加工 ➔ 終端廚師機，向右流動)
 * 2. 機器輸入端口順序決定後方供給機器的 Y 軸位置 (每個輸入端口定義獨立專屬橫向 Lane，內部嚴格遞迴對齊)
 * 3. 生成時方塊 100% 零重疊 (每列、每通道、環境流體與電網均具備充足防碰撞間距)
 */
export function applyHierarchicalLayout(
  nodes: SandboxNodeData[],
  connections: SandboxConnection[]
): void {
  // 1. 分離主要料理產線與中和解毒模組 (如胃復慘)
  const remedyNodes = nodes.filter(n =>
    n.id.includes('-88-') ||
    n.id.startsWith('pwr-coal-88') ||
    n.id.startsWith('pwr-gen-88') ||
    n.id.includes('decay-88-') ||
    n.id.includes('heal-base-88-') ||
    n.id.includes('pool-虛空-88') ||
    n.id.includes('pump-虛空-88')
  );
  const mainNodes = nodes.filter(n => !remedyNodes.includes(n));

  const layoutGroup = (groupNodes: SandboxNodeData[], originX: number) => {
    if (groupNodes.length === 0) return { maxX: originX, maxY: 80 };

    // 分類：獨立電網、環境流體基建、主製程機台
    const powerNodes = groupNodes.filter(n => n.type === 'generator' || n.id.startsWith('pwr-coal'));
    const envNodes = groupNodes.filter(n =>
      (n.type === 'environment_pool' || n.id.startsWith('pool-') || n.id.startsWith('pump-') || n.id.startsWith('sludge-manip-')) &&
      !n.id.startsWith('pump-trans-')
    );
    const prodNodes = groupNodes.filter(n => !powerNodes.includes(n) && !envNodes.includes(n));

    const chefNode = prodNodes.find(n => n.machineName === '自動廚師機');

    // 索引結構
    const nodeMap = new Map<string, SandboxNodeData>(prodNodes.map(n => [n.id, n]));
    const inConnsMap = new Map<string, SandboxConnection[]>();
    connections.forEach(c => {
      if (!inConnsMap.has(c.toNodeId)) inConnsMap.set(c.toNodeId, []);
      inConnsMap.get(c.toNodeId)!.push(c);
    });

    // 1) 加工層級推導 (決定 X 軸欄位)
    // 依設備離終端組合機台（自動廚師機）的逆向加工距離推導層級：
    // 終端廚師機距離為 0；直接供給廚師機之設備距離為 1；更上游原料或中間品依消費鏈路遞增。
    // 層級公式：Tier = MaxDistance - DistanceFromChef
    // 核心原則：
    // 1. 食譜必要製程優先：若設備具備食譜主要產出連線，其加工層級完全由主要產出決定。
    // 2. 產能回補不列入分級：連向重構底料/任意物品 (in-base) 之產能回補或副產物回輸屬額外彈性分配，
    //    不應使供給機台被迫提前至更早階層（例如研磨骨粉與重構蜘蛛蛋均直供混和麵團，維持在同一 X 坐標）。
    const COL_WIDTH = 380;
    const ROW_HEIGHT = 270;
    const LANE_GAP = 40;

    // ─────────────────────────────────────────────────────────────
    // 1. 【泵機系統】(左側縱向側欄 / 後端補給區，方便主產線與胃復慘共用)
    // ─────────────────────────────────────────────────────────────
    let envMaxX = originX;
    let envMaxY = 80;

    if (envNodes.length > 0) {
      let curEnvY = 80;
      const poolNodes = envNodes.filter(n => n.type === 'environment_pool');

      poolNodes.forEach(pool => {
        pool.x = originX;
        pool.y = curEnvY;

        const pump = envNodes.find(n => n.type === 'pump' && connections.some(c => c.fromNodeId === pool.id && c.toNodeId === n.id));
        const sludgeManip = pump ? envNodes.find(n => n.machineName === '物質操縱機' && connections.some(c => c.fromNodeId === n.id && c.toNodeId === pump.id)) : null;

        if (pump) {
          pump.x = originX + COL_WIDTH;
          pump.y = curEnvY;

          if (sludgeManip) {
            sludgeManip.x = originX + COL_WIDTH;
            sludgeManip.y = curEnvY + 245;
          }
        }

        const poolHeight = sludgeManip ? (245 * 2 + 30) : 245;
        curEnvY += poolHeight + 30;
      });

      envMaxX = originX + COL_WIDTH * 2;
      envMaxY = curEnvY;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. 【產線區域】(右上側區塊)
    // ─────────────────────────────────────────────────────────────
    const prodStartX = envNodes.length > 0 ? (envMaxX + 60) : originX;

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
      if (visiting.has(nodeId)) return 1; // 破除環路防禦
      visiting.add(nodeId);

      const primaryOuts = primaryOutsMap.get(nodeId) || [];
      const baseOuts = baseOutsMap.get(nodeId) || [];
      // 優先依必要製程流向推導；若僅作為專用底料供給機，則依所供給之機台推導
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

    // 排版各通道之製程機台 (足夠安全間距防重疊)
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
      const laneHeight = maxRowsInLane * ROW_HEIGHT;

      colsInLane.forEach((colNodes, t) => {
        colNodes.sort((a, b) => (ySubRankMap.get(a.id) || 0) - (ySubRankMap.get(b.id) || 0));
        const colX = prodStartX + t * COL_WIDTH;

        colNodes.forEach((node, rIdx) => {
          node.x = colX;
          node.y = curLaneY + rIdx * ROW_HEIGHT;
        });
      });

      curLaneY += laneHeight + LANE_GAP;
    }

    // 終端廚師機置於最右側欄位，垂直置中於各通道中央
    const maxProdX = prodStartX + maxProdTier * COL_WIDTH;
    if (chefNode) {
      chefNode.x = maxProdX;
      chefNode.y = Math.max(80, Math.round((80 + curLaneY - ROW_HEIGHT) / 2));
    }

    const maxProdY = curLaneY;

    // ─────────────────────────────────────────────────────────────
    // 3. 【電力系統】(右下側區塊，產線區域正下方，橫向並排釋放 Y 軸壓力)
    // ─────────────────────────────────────────────────────────────
    const coalMiners = powerNodes.filter(n => n.id.startsWith('pwr-coal'));
    const furnaces = powerNodes.filter(n => n.type === 'generator');

    const pwrStartY = Math.max(maxProdY, envMaxY) + 50;
    const pwrStartX = prodStartX;

    // 每排最多並排單元數 (依產線欄寬自適應，每單元佔 2 欄)
    const prodCols = maxProdTier + 1;
    const unitsPerRow = Math.max(2, Math.floor(prodCols / 2));

    coalMiners.forEach((miner, mIdx) => {
      const rowIdx = Math.floor(mIdx / unitsPerRow);
      const colInRow = mIdx % unitsPerRow;

      const unitX = pwrStartX + colInRow * 2 * COL_WIDTH;
      const unitY = pwrStartY + rowIdx * (245 * 2 + 40);

      // 採煤機置於單元左欄中央
      miner.x = unitX;
      miner.y = unitY + 120;

      // 該採煤機供給之 1~2 台熔爐並排於右欄上下
      const f1 = furnaces[mIdx * 2];
      const f2 = furnaces[mIdx * 2 + 1];

      if (f1) {
        f1.x = unitX + COL_WIDTH;
        f1.y = unitY;
      }
      if (f2) {
        f2.x = unitX + COL_WIDTH;
        f2.y = unitY + 245;
      }
    });

    const totalPwrRows = Math.ceil(coalMiners.length / unitsPerRow);
    const maxPwrY = coalMiners.length > 0 ? (pwrStartY + totalPwrRows * (245 * 2 + 40)) : maxProdY;
    const maxPwrX = coalMiners.length > 0 ? (pwrStartX + Math.min(coalMiners.length, unitsPerRow) * 2 * COL_WIDTH) : maxProdX;

    return {
      maxX: Math.max(maxProdX + COL_WIDTH, maxPwrX),
      maxY: Math.max(maxProdY, envMaxY, maxPwrY)
    };
  };

  // 1. 排版主要料理產線
  const mainBounds = layoutGroup(mainNodes, 60);

  // 2. 排版中和解毒模組 (如胃復慘，水平位移至右側獨立無干擾區域)
  if (remedyNodes.length > 0) {
    layoutGroup(remedyNodes, mainBounds.maxX + 100);
  }
}
