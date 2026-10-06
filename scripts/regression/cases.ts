// 回歸案例產生器（solver 1008 案例 + 沙盒 378 案例），供 snapshot CLI 與 npm run check 指紋比對共用。
import { calculateSingleDish } from '../../src/services/solver';
import { runParallelPlan } from '../../src/services/parallelPlanner';
import { buildDishBlueprint } from '../../src/services/dishBlueprintGenerator';
import { simulateSandboxPhysics } from '../../src/components/Sandbox/sandboxPhysics';
import { dataService } from '../../src/services/dataService';
import type { FeederStrategy } from '../../src/types';
import type { SandboxNodeData, SandboxConnection } from '../../src/components/Sandbox/sandboxTypes';

/** 全部食譜 × 發電模式 × 底料策略 × 速率，以及單道/兩道/三道並聯組合 */
export function buildSolverCases(): Record<string, unknown> {
  const recipes = dataService.getRecipes();
  const names = recipes.map(r => r.name);
  const modes = ['regular', 'overclock'] as const;
  const strategies: FeederStrategy[] = ['dedicated', 'recycle'];
  const result: Record<string, unknown> = {};

  for (const n of names) for (const m of modes) for (const s of strategies) for (const rate of [0.2, 0.4, 0.5]) {
    result[`single|${n}|${m}|${s}|${rate}`] = calculateSingleDish(n, rate, m, s);
  }

  const plans: { dishName: string; rateMin: number }[][] = [];
  names.forEach((n, i) => {
    plans.push([{ dishName: n, rateMin: 12 }]);
    plans.push([{ dishName: n, rateMin: 12 }, { dishName: names[(i + 1) % names.length], rateMin: 24 }]);
    plans.push([
      { dishName: n, rateMin: 12 },
      { dishName: names[(i + 7) % names.length], rateMin: 36 },
      { dishName: names[(i + 19) % names.length], rateMin: 24 },
    ]);
  });
  for (const plan of plans) for (const m of modes) for (const s of strategies) {
    const list = plan.map((p, idx) => ({ id: String(idx + 1), ...p }));
    const r = runParallelPlan(list, m, s, recipes);
    result[`plan|${plan.map(p => `${p.dishName}@${p.rateMin}`).join('+')}|${m}|${s}`] = {
      effectivePlannedList: r.effectivePlannedList,
      individualResults: r.individualResults,
      combinedBiochemicalWarnings: r.combinedBiochemicalWarnings,
      consolidated: r.consolidated,
    };
  }
  return result;
}

/** 全部食譜的官方藍圖（生成器 + 物理引擎）及擾動情境 */
export function buildSandboxCases(): Record<string, unknown> {
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
  return result;
}
