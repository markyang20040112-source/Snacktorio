import type { Item, Recipe, IntermediateRecipe } from '../types';

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
