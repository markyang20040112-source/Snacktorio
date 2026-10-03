import itemIconsData from '../data/itemIcons.json';
import recipesData from '../data/recipes.json';
import { dataService } from '../services/dataService';

const itemIcons: Record<string, string> = itemIconsData as Record<string, string>;

// 核心鐵律：終端菜餚不顯示料理圖片，亦不可模糊匹配原料圖示
const TERMINAL_RECIPES = new Set((recipesData as Array<{ name: string }>).map(r => r.name));

// Special direct process and alias mappings
const DIRECT_PROCESS_ALIASES: Record<string, string> = {
  '終端組裝': '自動廚師機.png',
  '絞碎史萊姆': '史萊姆肉餡.png',
  '混和麵團': '義大利麵團.png',
  '擠出千層麵皮': '煮熟的千層麵皮.png',
  '水煮千層麵皮': '煮熟的千層麵皮.png',
  '擠出義大利麵': '生義大利麵.png',
  '水煮義大利麵': '煮熟的義大利麵.png',
  '擠出通心粉': '生通心粉.png',
  '水煮通心粉': '煮熟的通心粉.png',
  '採收粉塵底料': '粉塵.png',
  '剝皮鷹身女妖肉': '生鷹身女妖肉.png',
  '採收刺菠蘿': '刺波蘿.png',
  '虛空熔爐': '熔爐.png',
  '虛空熔爐 (常規發電)': '熔爐.png',
  '虛空熔爐 (超頻發電)': '熔爐.png',
  '虛空熔爐 (常規)': '熔爐.png',
  '虛空熔爐 (超頻)': '熔爐.png',
  '發電熔爐': '熔爐.png',
};

/**
 * Returns the resolved icon URL for an item or machine.
 * Supports custom uploaded Data URLs (data:image/...), static icon assets,
 * or 'none' to explicitly indicate no icon should be shown.
 */
export function getItemIcon(name: string, customIcon?: string): string | undefined {
  if (customIcon === 'none') {
    return undefined;
  }
  if (customIcon && customIcon.trim()) {
    return customIcon.trim();
  }

  const cleanName = name ? name.trim() : '';
  if (!cleanName) return undefined;

  // 鐵律檢核：終端料理食譜嚴禁模糊匹配任何圖標
  if (TERMINAL_RECIPES.has(cleanName)) {
    return undefined;
  }

  // 0. Check dynamic custom icon from dataService (user uploaded photos)
  const customMap = dataService.getCustomIconMap();
  if (customMap[cleanName]) {
    return customMap[cleanName];
  }

  const formatUrl = (filename: string) =>
    `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`;

  // 1. Direct process alias lookup
  if (DIRECT_PROCESS_ALIASES[cleanName]) {
    return formatUrl(DIRECT_PROCESS_ALIASES[cleanName]);
  }

  // 2. Direct match in itemIcons
  if (itemIcons[cleanName]) {
    return formatUrl(itemIcons[cleanName]);
  }

  // 3. Synonym / typo normalization (莎莎 <-> 沙沙, 菠蘿 <-> 波蘿, 混和 <-> 混合)
  const normalized = cleanName
    .replace(/莎莎/g, '沙沙')
    .replace(/菠蘿/g, '波蘿')
    .replace(/混和/g, '混合');

  if (DIRECT_PROCESS_ALIASES[normalized]) {
    return formatUrl(DIRECT_PROCESS_ALIASES[normalized]);
  }
  if (itemIcons[normalized]) {
    return formatUrl(itemIcons[normalized]);
  }

  // 4. Stripped name without brackets or descriptors (e.g. "收割機 (底料專供)" -> "收割機", "攪拌蟑螂奶(奶油專線)" -> "攪拌蟑螂奶")
  const baseName = normalized.replace(/\s*[\(\[（【].*?[\)\]）】]\s*/g, '').trim();
  if (DIRECT_PROCESS_ALIASES[baseName]) {
    return formatUrl(DIRECT_PROCESS_ALIASES[baseName]);
  }
  if (baseName && itemIcons[baseName]) {
    return formatUrl(itemIcons[baseName]);
  }

  // 5. Extended action verb prefix stripping
  // Matches: 採收, 開採, 採集, 製作, 調配, 水煮, 油炸, 重構, 擠出, 研磨, 混合, 混和, 烘焙, 烘烤, 攪拌, 剝皮, 注入, 絞碎, 發酵, 炸, 煮, 採
  const actionPattern = /^(採收|開採|採集|製作|調配|水煮|油炸|重構|擠出|研磨|混合|混和|烘焙|烘烤|攪拌|剝皮|注入|絞碎|發酵|炸|煮|採)/;
  const strippedAction = baseName.replace(actionPattern, '').trim();

  if (strippedAction) {
    if (DIRECT_PROCESS_ALIASES[strippedAction]) {
      return formatUrl(DIRECT_PROCESS_ALIASES[strippedAction]);
    }
    if (itemIcons[strippedAction]) {
      return formatUrl(itemIcons[strippedAction]);
    }

    // Try prepending '生' (e.g. "鷹身女妖肉" -> "生鷹身女妖肉", "通心粉" -> "生通心粉")
    const rawForm = `生${strippedAction}`;
    if (itemIcons[rawForm]) {
      return formatUrl(itemIcons[rawForm]);
    }

    // Try prepending '煮熟的' (e.g. "義大利麵" -> "煮熟的義大利麵", "千層麵皮" -> "煮熟的千層麵皮")
    const cookedForm = `煮熟的${strippedAction}`;
    if (itemIcons[cookedForm]) {
      return formatUrl(itemIcons[cookedForm]);
    }

    // Try stripping state ("生", "熟", "煮熟的", "炸過的")
    const strippedState = strippedAction.replace(/^(生|熟|煮熟的|炸過的)/, '').trim();
    if (strippedState && itemIcons[strippedState]) {
      return formatUrl(itemIcons[strippedState]);
    }
    if (strippedState && itemIcons[`生${strippedState}`]) {
      return formatUrl(itemIcons[`生${strippedState}`]);
    }
    if (strippedState && itemIcons[`煮熟的${strippedState}`]) {
      return formatUrl(itemIcons[`煮熟的${strippedState}`]);
    }

    // Substring / fuzzy match fallback
    for (const [k, v] of Object.entries(itemIcons)) {
      if (k.includes(strippedAction) || strippedAction.includes(k)) {
        return formatUrl(v);
      }
    }
  }

  return undefined;
}

/**
 * Returns the default system library icon for an item name, ignoring custom overrides.
 */
export function getDefaultIcon(name: string): string | undefined {
  return getItemIcon(name, undefined);
}

export interface AvailableIcon {
  name: string;
  url: string;
  isCustom?: boolean;
  category?: string;
}

/**
 * Get all available icon entries (combining user-uploaded custom photos and system library icons)
 */
export function getAllAvailableIcons(): AvailableIcon[] {
  const result: AvailableIcon[] = [];
  const customMap = dataService.getCustomIconMap();
  const seen = new Set<string>();

  // 1. Add all custom uploaded icons first
  for (const [name, url] of Object.entries(customMap)) {
    result.push({
      name,
      url,
      isCustom: true,
      category: '自訂上傳'
    });
    seen.add(name);
  }

  // 2. Add all native game icons
  for (const [name, filename] of Object.entries(itemIcons)) {
    const url = `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`;
    if (!seen.has(name)) {
      result.push({
        name,
        url,
        isCustom: false,
        category: '遊戲原生'
      });
      seen.add(name);
    }
  }

  return result;
}
