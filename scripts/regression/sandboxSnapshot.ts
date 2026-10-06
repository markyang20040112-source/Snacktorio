// 沙盒回歸快照：對全部食譜的官方藍圖（生成器 + 物理引擎），以及多種擾動情境
// （斷線缺料、插入分流器 2:1 / 1:1:1、插入發酵緩衝、無中生有、發電超頻），
// 輸出 buildDishBlueprint 與 simulateSandboxPhysics 的完整結果，用於沙盒重構前後逐欄比對。
// （日常檢查請用 `npm run check`；本腳本用於需要逐欄查看差異時。案例定義見 cases.ts）
//
// 用法（需 Node.js 22+）：
//   1. 修改前：npx tsx scripts/regression/sandboxSnapshot.ts before.sandbox.snapshot.json
//   2. 修改後：npx tsx scripts/regression/sandboxSnapshot.ts after.sandbox.snapshot.json
//   3. 比對：  node scripts/regression/compare.mjs before.sandbox.snapshot.json after.sandbox.snapshot.json
import { writeFileSync } from 'node:fs';
import { buildSandboxCases } from './cases';

const out = process.argv[2] || 'sandbox.snapshot.json';
const result = buildSandboxCases();
writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${Object.keys(result).length} sandbox cases -> ${out}`);
