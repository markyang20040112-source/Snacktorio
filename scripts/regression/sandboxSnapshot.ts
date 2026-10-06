// 沙盒回歸快照：對全部食譜的官方藍圖（生成器 + 物理引擎），以及多種擾動情境
// （斷線缺料、插入分流器 2:1 / 1:1:1、插入發酵緩衝、無中生有、發電超頻），
// 輸出 buildDishBlueprint 與 simulateSandboxPhysics 的完整結果，用於沙盒重構前後逐欄比對。
//
// 用法（需 Node.js 22+）：
//   1. 修改前：npx tsx scripts/regression/sandboxSnapshot.ts before.sandbox.snapshot.json
//   2. 修改後：npx tsx scripts/regression/sandboxSnapshot.ts after.sandbox.snapshot.json
//   3. 比對：  node scripts/regression/compare.mjs before.sandbox.snapshot.json after.sandbox.snapshot.json
import { writeFileSync } from 'node:fs';
import { buildDishBlueprint } from '../../src/services/dishBlueprintGenerator';
import { simulateSandboxPhysics } from '../../src/components/Sandbox/sandboxPhysics';
import { dataService } from '../../src/services/dataService';
import type { SandboxNodeData, SandboxConnection } from '../../src/components/Sandbox/sandboxTypes';

const out = process.argv[2] || 'sandbox.snapshot.json';
const result: Record<string, unknown> = {};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const stripTimes = (bp: unknown) =>
  JSON.parse(JSON.stringify(bp, (k, v) => (k === 'createdAt' || k === 'updatedAt' ? undefined : v)));

const blankNode = (id: string, type: SandboxNodeData['type'], extra: Partial<SandboxNodeData>): SandboxNodeData => ({
  id, type, title: id, x: 0, y: 0,
  baseCycleTime: 0, baseOutputCount: 1, basePowerConsumption: 0, baseGoblins: 0,
  actualCycleTime: 0, efficiency: 0, actualPower: 0, actualGoblins: 0,
  fluidSaturation: 1, solidSaturation: 1, inputs: [], outputs: [], ...extra,
});

/** 在第一條固體連線中間插入一個節點（分流器 / 發酵緩衝） */
const insertOnFirstSolid = (
  nodes: SandboxNodeData[], conns: SandboxConnection[], mid: SandboxNodeData, inPort: string, outPorts: string[]
) => {
  const target = conns.find(c => c.type === 'solid');
  if (!target) return false;
  nodes.push(mid);
  conns.splice(conns.indexOf(target), 1,
    { ...target, id: `${target.id}-a`, toNodeId: mid.id, toPortId: inPort },
    { ...target, id: `${target.id}-b`, fromNodeId: mid.id, fromPortId: outPorts[0] });
  return true;
};

const sim = (key: string, nodes: SandboxNodeData[], conns: SandboxConnection[]) => {
  result[key] = simulateSandboxPhysics(nodes, conns);
};

dataService.getRecipes().forEach((dish, idx) => {
  const bp = buildDishBlueprint(dish, idx);
  result[`bp|${dish.name}`] = stripTimes(bp);

  // 1. 每 3 條斷 1 條（缺料 / 欠壓 / 停機傳導）
  sim(`drop3|${dish.name}`, clone(bp.nodes), clone(bp.connections).filter((_, i) => i % 3 !== 2));

  // 2. 分流器 2:1（2 出）與 1:1:1（3 出）
  for (const ratios of [[2, 1], [1, 1, 1]]) {
    const nodes = clone(bp.nodes), conns = clone(bp.connections);
    const outs = ratios.map((_, i) => `out-item-${i + 1}`);
    insertOnFirstSolid(nodes, conns, blankNode('t-split', 'splitter', {
      machineName: '分流器', splitterMode: 'custom', splitterRatios: ratios,
      inputs: [{ id: 'in-item', name: '待分流物料', type: 'solid' }],
      outputs: outs.map(id => ({ id, name: id, type: 'solid' as const, rateProvided: 0 })),
    }), 'in-item', outs);
    sim(`split${ratios.join(':')}|${dish.name}`, nodes, conns);
  }

  // 3. 發酵緩衝（以被插入連線的物料名稱為原料）
  {
    const nodes = clone(bp.nodes), conns = clone(bp.connections);
    const first = conns.find(c => c.type === 'solid');
    if (first) {
      insertOnFirstSolid(nodes, conns, blankNode('t-buf', 'buffer_decay', {
        machineName: '發酵緩衝', recipeName: first.itemOrFluidName, baseCycleTime: 15, actualCycleTime: 15,
        inputs: [{ id: 'in-raw', name: first.itemOrFluidName, type: 'solid', rateRequired: 0.2 }],
        outputs: [{ id: 'out-spoiled', name: first.itemOrFluidName, type: 'solid', rateProvided: 0 }],
      }), 'in-raw', ['out-spoiled']);
      sim(`buffer|${dish.name}`, nodes, conns);
    }
  }

  // 4. 無中生有（隔一台開啟）+ 斷線
  {
    const nodes = clone(bp.nodes).map((n, i) => (i % 2 ? { ...n, isMockInfiniteSupply: true } : n));
    sim(`mock|${dish.name}`, nodes, clone(bp.connections).filter((_, i) => i % 4 !== 1));
  }

  // 5. 發電熔爐超頻 + 終端產能 24 份/分
  {
    const nodes = clone(bp.nodes).map(n =>
      n.type === 'generator' ? { ...n, powerMode: 'overclock' as const }
        : n.machineName === '自動廚師機' ? { ...n, targetRatePerMin: 24 } : n);
    sim(`oc24|${dish.name}`, nodes, clone(bp.connections));
  }

  // 6. 部分欠壓：拔除供汙泥（超頻泵降回常規 → 流體欠壓週期稀釋）、無輸入之原料機產量減半（固體瓶頸傳導）
  const halve = (n: SandboxNodeData): SandboxNodeData => ({
    ...n,
    pumpCapacity: n.pumpCapacity ? n.pumpCapacity / 2 : n.pumpCapacity,
    baseOutputCount: n.baseOutputCount / 2,
    outputs: n.outputs.map(p => ({ ...p, rateProvided: (p.rateProvided || 0) / 2 })),
  });
  sim(`nosludge|${dish.name}`, clone(bp.nodes), clone(bp.connections).filter(c => !c.toPortId.includes('sludge')));
  sim(`halfraw|${dish.name}`,
    clone(bp.nodes).map(n => (n.type === 'machine' && n.inputs.length === 0 ? halve(n) : n)), clone(bp.connections));
});

writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${Object.keys(result).length} sandbox cases -> ${out}`);
