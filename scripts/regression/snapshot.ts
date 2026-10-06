// 回歸快照：對全部食譜 × 發電模式 × 底料策略 × 速率，以及單道/兩道/三道並聯組合，
// 輸出 calculateSingleDish 與 runParallelPlan 的完整結果，用於重構前後逐欄比對。
// （日常檢查請用 `npm run check`；本腳本用於需要逐欄查看差異時。案例定義見 cases.ts）
//
// 用法（需 Node.js 22+）：
//   1. 修改前：npx tsx scripts/regression/snapshot.ts before.snapshot.json
//   2. 修改後：npx tsx scripts/regression/snapshot.ts after.snapshot.json
//   3. 比對：  node scripts/regression/compare.mjs before.snapshot.json after.snapshot.json
// 「IDENTICAL」代表所有計算結果逐欄完全一致。
import { writeFileSync } from 'node:fs';
import { buildSolverCases } from './cases';

const out = process.argv[2] || 'snapshot.snapshot.json';
const result = buildSolverCases();
writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${Object.keys(result).length} cases -> ${out}`);
