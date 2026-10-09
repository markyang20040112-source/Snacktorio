import { computeIntegerRatio } from './solver';
import { makeNode } from '../components/Sandbox/sandboxNodeUtils';
import { SandboxNodeData, SandboxConnection, PortDefinition } from '../components/Sandbox/sandboxTypes';

export interface SolidTargetSpec {
  toNode: SandboxNodeData;
  toPort: PortDefinition;
  flowRate: number;
  isByproduct?: boolean;
  decayPath?: string[];
}

/**
 * 固體物料下游路由引擎：
 * 1. 副產物直供：湊滿 0.20/s 直接拉線至目標設備之 in-base 底料端（零合流器）。
 * 2. 均分直供：所有下游需量相等（1:1 或 1:1:1）時，利用機台多輸出口均分物理，直連下游（零分流器）。
 * 3. 比例分流：出現兩個或以上無法平分之需量時，插入 1 台可調比例分流器 (Splitter) 作為中轉。
 * 4. 時序發酵：若下游端口需要熟成/發酵產物，自動插入發酵緩衝方塊 (buffer_decay)。
 */
export function routeSolidOutputs(
  dishIndex: number,
  pIdx: number,
  instIdx: number,
  fromNode: SandboxNodeData,
  fromPort: PortDefinition,
  itemName: string,
  targets: SolidTargetSpec[],
  splitterCounter: { current: number },
  spoilMap: Map<string, { product: string; time: number }>
): { extraNodes: SandboxNodeData[]; connections: SandboxConnection[] } {
  const extraNodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];

  const byproductTargets = targets.filter(t => t.isByproduct);
  const regularTargets = targets.filter(t => !t.isByproduct);

  // 1. 副產物直供 (Rule: 直接拉線到重構機/烤箱 in-base，湊足 0.20/s)
  byproductTargets.forEach((t, bIdx) => {
    connections.push({
      id: `c-byprod-${dishIndex}-${pIdx}-${instIdx}-${bIdx}`,
      fromNodeId: fromNode.id,
      fromPortId: fromPort.id,
      toNodeId: t.toNode.id,
      toPortId: t.toPort.id,
      itemOrFluidName: itemName,
      type: 'solid',
      actualFlowRate: t.flowRate || 0.20
    });
  });

  // 輔助函式：將來源端口接入目標端口（若需發酵則串聯 buffer_decay）
  const connectWithDecay = (
    srcNode: SandboxNodeData,
    srcPortId: string,
    target: SolidTargetSpec,
    subId: string,
    flowRate: number
  ) => {
    const decayPath = target.decayPath || [];
    if (decayPath.length === 0) {
      connections.push({
        id: `c-sol-${subId}`,
        fromNodeId: srcNode.id,
        fromPortId: srcPortId,
        toNodeId: target.toNode.id,
        toPortId: target.toPort.id,
        itemOrFluidName: itemName,
        type: 'solid',
        actualFlowRate: flowRate
      });
      return;
    }

    let prevNode = srcNode;
    let prevPortId = srcPortId;
    let currentItem = itemName;

    decayPath.forEach((nextItem, dStep) => {
      const perishInfo = spoilMap.get(currentItem) || { time: 15 };
      const bufId = `decay-${subId}-${dStep}`;
      const bufNode = makeNode({
        id: bufId,
        type: 'buffer_decay',
        title: `發酵緩衝 (${currentItem} ➔ ${nextItem})`,
        machineName: '發酵緩衝',
        recipeName: nextItem,
        x: (srcNode.x + target.toNode.x) / 2 + dStep * 140,
        y: (srcNode.y + target.toNode.y) / 2 + dStep * 80,
        baseCycleTime: perishInfo.time,
        baseOutputCount: 1,
        basePowerConsumption: 0,
        baseGoblins: 0,
        inputs: [{ id: `in-${currentItem}`, name: currentItem, type: 'solid' }],
        outputs: [{ id: `out-${nextItem}`, name: nextItem, type: 'solid', rateProvided: 0.2 }],
        isAutoPepto: srcNode.isAutoPepto
      });

      extraNodes.push(bufNode);
      connections.push({
        id: `c-dec-in-${subId}-${dStep}`,
        fromNodeId: prevNode.id,
        fromPortId: prevPortId,
        toNodeId: bufNode.id,
        toPortId: `in-${currentItem}`,
        itemOrFluidName: currentItem,
        type: 'solid',
        actualFlowRate: flowRate
      });

      prevNode = bufNode;
      prevPortId = `out-${nextItem}`;
      currentItem = nextItem;
    });

    connections.push({
      id: `c-dec-out-${subId}`,
      fromNodeId: prevNode.id,
      fromPortId: prevPortId,
      toNodeId: target.toNode.id,
      toPortId: target.toPort.id,
      itemOrFluidName: currentItem,
      type: 'solid',
      actualFlowRate: flowRate
    });
  };

  // 2. 常規固體目標分流決策
  if (regularTargets.length === 1) {
    const t = regularTargets[0];
    connectWithDecay(fromNode, fromPort.id, t, `dir-${dishIndex}-${pIdx}-${instIdx}-0`, t.flowRate || 0.20);
  } else if (regularTargets.length > 1) {
    const rates = regularTargets.map(t => Number((t.flowRate || 0.2).toFixed(3)));
    const allEqual = rates.every(rt => Math.abs(rt - rates[0]) < 0.001);

    if (allEqual) {
      // 均分直供：所有目標流量相同，直接由機台分流，不需分流器
      regularTargets.forEach((t, tIdx) => {
        connectWithDecay(fromNode, fromPort.id, t, `eq-${dishIndex}-${pIdx}-${instIdx}-${tIdx}`, t.flowRate || 0.20);
      });
    } else {
      // 非均分比例分流：配置分流器作為中轉
      splitterCounter.current++;
      const ratios = computeIntegerRatio(rates);
      const splitterId = `splitter-${dishIndex}-${pIdx}-${instIdx}-${splitterCounter.current}`;
      const sumRatios = ratios.reduce((a, b) => a + b, 0);
      const totalFlow = rates.reduce((a, b) => a + b, 0);

      const splitterNode = makeNode({
        id: splitterId,
        type: 'splitter',
        title: `分流器 (${itemName}) · ${regularTargets.length}出`,
        machineName: '分流器',
        x: fromNode.x + 380,
        y: fromNode.y,
        baseCycleTime: 1,
        baseOutputCount: 1,
        basePowerConsumption: 0,
        baseGoblins: 0,
        splitterMode: 'custom',
        splitterRatios: ratios,
        inputs: [{ id: 'in-item', name: itemName, type: 'solid' }],
        outputs: ratios.map((r, idx) => ({
          id: `out-item-${idx + 1}`,
          name: `${itemName} (${String.fromCharCode(65 + idx)})`,
          type: 'solid',
          rateProvided: Number((totalFlow * r / sumRatios).toFixed(3))
        })),
        isAutoPepto: fromNode.isAutoPepto
      });

      extraNodes.push(splitterNode);

      // 上游機台直連分流器輸入端口
      connections.push({
        id: `c-sp-in-${dishIndex}-${pIdx}-${instIdx}-${splitterCounter.current}`,
        fromNodeId: fromNode.id,
        fromPortId: fromPort.id,
        toNodeId: splitterNode.id,
        toPortId: 'in-item',
        itemOrFluidName: itemName,
        type: 'solid',
        actualFlowRate: totalFlow
      });

      // 分流器各出口分別連向下游目標
      regularTargets.forEach((t, tIdx) => {
        connectWithDecay(
          splitterNode,
          `out-item-${tIdx + 1}`,
          t,
          `sp-${dishIndex}-${pIdx}-${instIdx}-${splitterCounter.current}-${tIdx}`,
          t.flowRate || 0.20
        );
      });
    }
  }

  return { extraNodes, connections };
}
