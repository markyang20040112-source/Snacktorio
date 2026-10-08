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
    // 若設備產出有多個下游去向，為保證輸送帶一律由左向右流動 (col_from < col_to)，其距離取下游去向之最大值 + 1。
    const outConnsMap = new Map<string, string[]>();
    prodNodes.forEach(n => outConnsMap.set(n.id, []));
    connections.forEach(c => {
      if (nodeMap.has(c.fromNodeId) && nodeMap.has(c.toNodeId)) {
        outConnsMap.get(c.fromNodeId)!.push(c.toNodeId);
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

      const outs = outConnsMap.get(nodeId) || [];
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

    // 2) 依下游機器輸入端口順序分配 Y 軸通道 (Port-Lanes)
    // 每個終端廚師機輸入端口定義獨立橫向帶狀通道 (Lane 0, Lane 1...)
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

    // 3) 排版各通道之製程機台 (緊湊舒適間距，保證 100% 無重疊)
    const COL_WIDTH = 380;
    const ROW_HEIGHT = 225;
    const LANE_GAP = 30;
    const START_X = originX + 60;
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
        const colX = START_X + t * COL_WIDTH;

        colNodes.forEach((node, rIdx) => {
          node.x = colX;
          node.y = curLaneY + rIdx * ROW_HEIGHT;
        });
      });

      curLaneY += laneHeight + LANE_GAP;
    }

    // 終端廚師機置於最右側欄位，垂直置中於各通道中央
    const maxProdX = START_X + maxProdTier * COL_WIDTH;
    if (chefNode) {
      chefNode.x = maxProdX;
      chefNode.y = Math.max(80, Math.round((80 + curLaneY - ROW_HEIGHT) / 2));
    }

    const maxProdY = curLaneY;

    // 4) 環境流體與泵機模組 (緊湊排列於主產線下方獨立區塊)
    const envY = maxProdY + 40;
    const poolNodes = envNodes.filter(n => n.type === 'environment_pool');
    poolNodes.forEach((pool, pIdx) => {
      pool.x = START_X;
      pool.y = envY + pIdx * 210;

      const pump = envNodes.find(n => n.type === 'pump' && connections.some(c => c.fromNodeId === pool.id && c.toNodeId === n.id));
      if (pump) {
        pump.x = START_X + COL_WIDTH;
        pump.y = pool.y;

        const sludgeManip = envNodes.find(n => n.machineName === '物質操縱機' && connections.some(c => c.fromNodeId === n.id && c.toNodeId === pump.id));
        if (sludgeManip) {
          sludgeManip.x = START_X + COL_WIDTH * 2;
          sludgeManip.y = pool.y;
        }
      }
    });

    const envTotalHeight = poolNodes.length * 210;
    const maxEnvY = envNodes.length > 0 ? envY + envTotalHeight : maxProdY;

    // 5) 自給電網發電模組 (配置於流體區塊下方，雙欄縱向排列)
    const pwrY = maxEnvY + 40;
    const coalMiners = powerNodes.filter(n => n.id.startsWith('pwr-coal'));
    const furnaces = powerNodes.filter(n => n.type === 'generator');

    coalMiners.forEach((miner, mIdx) => {
      miner.x = START_X;
      miner.y = pwrY + mIdx * 210;
    });

    furnaces.forEach((furnace, fIdx) => {
      furnace.x = START_X + COL_WIDTH;
      furnace.y = pwrY + fIdx * 200;
    });

    const maxPwrY = pwrY + Math.max(coalMiners.length * 210, furnaces.length * 200);

    return {
      maxX: maxProdX + COL_WIDTH,
      maxY: maxPwrY
    };
  };

  // 1. 排版主要料理產線
  const mainBounds = layoutGroup(mainNodes, 60);

  // 2. 排版中和解毒模組 (如胃復慘，水平位移至右側獨立無干擾區域)
  if (remedyNodes.length > 0) {
    layoutGroup(remedyNodes, mainBounds.maxX + 100);
  }
}
