/**
 * 全料理沙盒藍圖批次產生器 (CLI)
 * 以 src/services/dishBlueprintGenerator 之 buildDishBlueprint 為唯一產線推導邏輯，
 * 依 recipes 順序 (index = 食譜索引) 重建全部料理藍圖，並保留既有之 'bp_starter_generator' 置於最前。
 *
 * 用法：
 *   npx tsx scripts/generateAllDishBlueprints.ts            # 覆寫 src/data/sandboxBlueprints.json
 *   npx tsx scripts/generateAllDishBlueprints.ts <out.json> # 輸出至指定路徑 (比對/預覽用)
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildDishBlueprint } from '../src/services/dishBlueprintGenerator';
import { dataService } from '../src/services/dataService';
import type { SandboxBlueprint } from '../src/components/Sandbox/sandboxTypes';

const dataBpPath = path.resolve(process.cwd(), 'src/data/sandboxBlueprints.json');
const outPath = process.argv[2] ? path.resolve(process.argv[2]) : dataBpPath;
const recipes = dataService.getRecipes();

console.log(`Building all ${recipes.length} dish blueprints with auto-healed pipelines & zero-deficit verification...`);
const allBlueprints: SandboxBlueprint[] = [];

// Also preserve starter generator blueprint
const existingBps: SandboxBlueprint[] = fs.existsSync(dataBpPath) ? JSON.parse(fs.readFileSync(dataBpPath, 'utf-8')) : [];
const starterBp = existingBps.find(b => b.id === 'bp_starter_generator');
if (starterBp) allBlueprints.push(starterBp);

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

fs.writeFileSync(outPath, JSON.stringify(allBlueprints, null, 2), 'utf-8');
console.log(`Successfully written to ${outPath}!`);
