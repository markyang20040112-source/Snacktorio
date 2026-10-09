import type { Item, Recipe, IntermediateRecipe } from '../types';
import { PROCESS_ACTION_VERBS } from './actionVerbs';

/**
 * 物品特性判定（純資料驅動，單一事實來源）
 * 原則：不以 AI/名稱推測分類，一律由 src/data/*.json 既有欄位推導，新增食譜/物品時自動適配。
 */

/** 由環境池 + 泵機供應之環境流體（遊戲物理常數，非物品分類） */
export const ENV_FLUIDS = ['水', '油', '虛空'];

/**
 * 連續管網流體名稱集合：環境流體 + 任何被終端食譜 / 中間配方引用為 fluidType（液體輸入）的物品。
 * 例：塔瑪茄醬被某料理的 fluidType 引用 → 即為流體。新食譜引用新流體時自動納入，無需維護名單。
 */
export function buildFluidNameSet(recipes: Recipe[], intermediate: IntermediateRecipe[]): Set<string> {
  const set = new Set<string>(ENV_FLUIDS);
  for (const r of [...recipes, ...intermediate]) {
    if (r.fluidType && r.fluidType !== '無') set.add(r.fluidType);
  }
  return set;
}

/** 是否為連續流體：先查資料推導集合，再參考 items.json 明確標記之 isFluid */
export function isFluidName(name: string, fluidNames: Set<string>, items?: Item[]): boolean {
  if (!name) return false;
  if (fluidNames.has(name)) return true;
  const item = items?.find(i => i.name === name);
  if (item && item.isFluid !== undefined) return Boolean(item.isFluid);
  return false;
}

export type RawSourceMachine = '物質操縱機' | '採掘機' | '收割機';

/** 原料產出機台：依 items.json 之 source 判定（物質操縱機 / 採掘機，其餘一律收割機） */
export function rawSourceMachine(item?: Pick<Item, 'source'> | null): RawSourceMachine {
  const src = item?.source;
  if (src === '物質操縱機') return '物質操縱機';
  if (src === '採掘機' || src === '採掘機直接開採') return '採掘機';
  return '收割機';
}

/** 會隨時間變質 / 發酵之物品：items.json 中 isPerishable 且有 spoilProduct 者 */
export function perishableItems(items: Item[]): Item[] {
  return items.filter(i => i.isPerishable && i.spoilProduct);
}

/**
 * 檢查某物品或工序在配方有向圖 (DAG) 中，是否向上依賴目標產品 (多階祖先追蹤)。
 * 用於副產物折抵之祖源死鎖防護 (避免「產品捐給自己上游原料」之閉環死鎖)。
 */
export function isUpstreamAncestor(
  donorItemOrProc: string,
  targetProduct: string,
  intermediateRecipes: IntermediateRecipe[],
  items?: Item[],
  visited = new Set<string>()
): boolean {
  if (!donorItemOrProc || !targetProduct) return false;
  if (visited.has(donorItemOrProc)) return false;
  visited.add(donorItemOrProc);

  const clean = donorItemOrProc.replace(PROCESS_ACTION_VERBS, '').trim();
  if (clean === targetProduct || clean.includes(targetProduct) || targetProduct.includes(clean)) {
    return true;
  }

  // 變質熟成 (Decay / Spoil) 逆向溯源：若此物品為某物之熟成變質產物 (如中等熟成奶酪來自軟質奶酪)
  if (items) {
    const parent = items.find(it => it.spoilProduct === clean);
    if (parent && isUpstreamAncestor(parent.name, targetProduct, intermediateRecipes, items, visited)) {
      return true;
    }
  }

  // 搜尋產出此物品或工序之中間配方
  const matching = intermediateRecipes.filter(r => 
    r.name === clean || 
    r.name === donorItemOrProc ||
    r.name.includes(clean) ||
    clean.includes(r.name)
  );

  for (const r of matching) {
    // 1. 固體原料遞迴檢查
    for (const inp of r.inputs || []) {
      if (!inp.name || ['無', '任意物品', '重構底料', '底料'].includes(inp.name)) continue;
      if (inp.name === targetProduct || inp.name.includes(targetProduct) || targetProduct.includes(inp.name)) {
        return true;
      }
      if (isUpstreamAncestor(inp.name, targetProduct, intermediateRecipes, items, visited)) {
        return true;
      }
    }
    // 2. 流體原料 (fluidType) 遞迴檢查
    if (r.fluidType && !['無', '水', '油', '虛空'].includes(r.fluidType)) {
      if (r.fluidType === targetProduct || r.fluidType.includes(targetProduct) || targetProduct.includes(r.fluidType)) {
        return true;
      }
      if (isUpstreamAncestor(r.fluidType, targetProduct, intermediateRecipes, items, visited)) {
        return true;
      }
    }
  }
  return false;
}

/** 建立節點可達性追蹤集合 (用於動態副產物連線防閉環檢查) */
export function initReachabilityMap(nodeNames: string[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  nodeNames.forEach(name => map.set(name, new Set([name])));
  return map;
}

/** 檢查將 supplier 連至 recipient 是否會造成有向圖閉環死鎖 */
export function canAddDependency(
  supplierName: string,
  recName: string,
  reachMap: Map<string, Set<string>>
): boolean {
  if (supplierName === recName) return false;
  const recReachable = reachMap.get(recName);
  return !recReachable || !recReachable.has(supplierName);
}

/** 記錄 supplier 連至 recipient 之依賴邊，並刷新遞移閉包 (Transitive Closure) */
export function recordDependency(
  supplierName: string,
  recName: string,
  reachMap: Map<string, Set<string>>
): void {
  const recReachable = reachMap.get(recName) || new Set([recName]);
  reachMap.forEach((targets, src) => {
    if (src === supplierName || targets.has(supplierName)) {
      targets.add(recName);
      recReachable.forEach(t => targets.add(t));
    }
  });
}

