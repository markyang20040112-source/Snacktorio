import seedBlueprints from '../data/sandboxBlueprints.json';
import type { SandboxBlueprint } from '../components/Sandbox/sandboxTypes';
import { buildDishBlueprint } from './dishBlueprintGenerator';
import { dataService } from './dataService';

/**
 * 官方內建藍圖（執行期生成）
 * - 全部料理藍圖不再存放於 sandboxBlueprints.json，而是依目前資料庫對每道食譜即時呼叫 buildDishBlueprint 生成
 *   （與舊版存檔內容逐位元組一致；資料庫變動時自動跟著更新，並省下約一半打包體積）。
 * - sandboxBlueprints.json 只保存「無法自動生成」的藍圖：教學範例、使用者經 GitHub 同步上傳的自訂 / 修改專案。
 *   檔案中若已有某道料理的藍圖（使用者修改版），以檔案版本為準，不再重新生成該道。
 * - 依 dataService 資料版本號快取，資料未變時不重複生成；每次回傳深拷貝，呼叫端可安全修改。
 */

interface BuiltInCache {
  revision: number;
  /** 純自動生成之料理藍圖（id → 去除時間戳之內容指紋） */
  generatedFingerprints: Map<string, string>;
  /** 內建清單 JSON（種子檔 + 未被種子檔涵蓋之自動生成藍圖） */
  builtInJson: string;
}

let cache: BuiltInCache | null = null;

/** 藍圖內容指紋：忽略 createdAt / updatedAt */
const fingerprint = (bp: SandboxBlueprint) => JSON.stringify({ ...bp, createdAt: undefined, updatedAt: undefined });

function ensureCache(): BuiltInCache {
  const revision = dataService.getRevision();
  if (cache && cache.revision === revision) return cache;

  const seeds = (seedBlueprints as unknown as SandboxBlueprint[]) || [];
  const list: SandboxBlueprint[] = [...seeds];
  const coveredDishes = new Set<string>();
  seeds.forEach(bp => (bp.stats?.mainDishes || []).forEach(d => coveredDishes.add(d)));

  const generatedFingerprints = new Map<string, string>();
  try {
    dataService.getRecipes().forEach((dish, idx) => {
      try {
        const bp = buildDishBlueprint(dish, idx);
        generatedFingerprints.set(bp.id, fingerprint(bp));
        if (!coveredDishes.has(dish.name)) {
          list.push(bp);
          coveredDishes.add(dish.name);
        }
      } catch (err) {
        console.warn(`自動為食譜 ${dish.name} 生成產線專案失敗:`, err);
      }
    });
  } catch (e) {
    console.error('無法讀取食譜庫進行藍圖自動生成', e);
  }

  cache = { revision, generatedFingerprints, builtInJson: JSON.stringify(list) };
  return cache;
}

/** 取得完整內建 / 官方藍圖清單（深拷貝） */
export function getBuiltInBlueprints(): SandboxBlueprint[] {
  return JSON.parse(ensureCache().builtInJson);
}

/**
 * 移除「與目前自動生成版本完全相同」的官方料理藍圖（可由資料庫重建，同步至 GitHub 時無須存檔）。
 * 使用者修改過（內容不同）的官方藍圖與所有自訂專案一律保留。
 */
export function stripRegenerableBlueprints(list: SandboxBlueprint[]): SandboxBlueprint[] {
  const { generatedFingerprints } = ensureCache();
  return list.filter(bp => generatedFingerprints.get(bp.id) !== fingerprint(bp));
}
