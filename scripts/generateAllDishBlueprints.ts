/**
 * 料理產線藍圖批次檢查 (CLI)
 * 官方料理藍圖已改為「執行期由資料庫自動生成」(src/services/builtInBlueprints.ts)，
 * 不再寫入 src/data/sandboxBlueprints.json（該檔只保存無法自動生成的自訂 / 修改專案）。
 * 本腳本以 buildDishBlueprint 生成全部料理藍圖並逐道回報是否缺料，用於登錄新食譜後的驗證。
 *
 * 用法：
 *   npx tsx scripts/generateAllDishBlueprints.ts            # 僅檢查並列出結果
 *   npx tsx scripts/generateAllDishBlueprints.ts <out.json> # 另將完整藍圖輸出至指定路徑 (檢視/比對用)
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildDishBlueprint } from '../src/services/dishBlueprintGenerator';
import { dataService } from '../src/services/dataService';
import type { SandboxBlueprint } from '../src/components/Sandbox/sandboxTypes';

const outPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const recipes = dataService.getRecipes();

console.log(`Building all ${recipes.length} dish blueprints with auto-healed pipelines & zero-deficit verification...`);
const allBlueprints: SandboxBlueprint[] = [];

let deficitDishes = 0;
recipes.forEach((dish, idx) => {
  const bp = buildDishBlueprint(dish, idx);
  allBlueprints.push(bp);

  const defNodes = bp.nodes.filter(n => n.inputs.some(p => p.isDeficit));
  if (defNodes.length > 0) {
    deficitDishes++;
    console.log(`⚠️ [${dish.name}] Deficit nodes (${defNodes.length}):`, defNodes.map(n => `${n.title} (${n.statusNote})`));
  } else {
    console.log(`✅ [${dish.name}] Perfect! 0 deficit, 100% efficient.`);
  }
});

console.log(`-----------------------------------------------`);
console.log(`Generated ${allBlueprints.length} blueprints total.`);
console.log(`Deficit dishes count: ${deficitDishes} / ${recipes.length}`);

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(allBlueprints, null, 2), 'utf-8');
  console.log(`Successfully written to ${outPath}!`);
}
