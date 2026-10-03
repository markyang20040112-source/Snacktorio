// 回歸快照：對全部食譜 × 發電模式 × 底料策略 × 速率，以及單道/兩道/三道並聯組合，
// 輸出 calculateSingleDish 與 runParallelPlan 的完整結果，用於重構前後逐欄比對。
//
// 用法（需 Node.js 22+）：
//   1. 修改前：npx tsx scripts/regression/snapshot.ts before.snapshot.json
//   2. 修改後：npx tsx scripts/regression/snapshot.ts after.snapshot.json
//   3. 比對：  node scripts/regression/compare.mjs before.snapshot.json after.snapshot.json
// 「IDENTICAL」代表所有計算結果逐欄完全一致。
import { writeFileSync } from 'node:fs';
import { calculateSingleDish } from '../../src/services/solver';
import { runParallelPlan } from '../../src/services/parallelPlanner';
import { dataService } from '../../src/services/dataService';
import type { FeederStrategy } from '../../src/types';

const out = process.argv[2] || 'snapshot.snapshot.json';
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

writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${Object.keys(result).length} cases -> ${out}`);
