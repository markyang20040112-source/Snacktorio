import itemIconsData from '../data/itemIcons.json';

const itemIcons: Record<string, string> = itemIconsData as Record<string, string>;

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

  // 1. Direct match
  if (itemIcons[cleanName]) {
    const filename = itemIcons[cleanName];
    return `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`;
  }

  // 2. Stripped name without brackets or descriptors (e.g. "收割機 (底料專供)" -> "收割機")
  const baseName = cleanName.replace(/\s*[\(\[（【].*?[\)\]）】]\s*/g, '').trim();
  if (baseName && itemIcons[baseName]) {
    const filename = itemIcons[baseName];
    return `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`;
  }

  // 3. Normalized matching (e.g. removing "熟" or "生")
  const strippedState = baseName.replace(/^(生|熟|煮熟的|炸過的)/, '').trim();
  if (strippedState && itemIcons[strippedState]) {
    const filename = itemIcons[strippedState];
    return `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`;
  }

  // 4. Action prefix matching (e.g. "採收日桂葉" -> "日桂葉", "研磨骨粉" -> "骨粉", "水煮通心粉" -> "通心粉")
  const strippedAction = baseName.replace(/^(採收|開採|採集|製作|調配|水煮|油炸|重構|擠出|研磨|混合|烘焙|發酵|採)/, '').trim();
  if (strippedAction && itemIcons[strippedAction]) {
    const filename = itemIcons[strippedAction];
    return `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`;
  }

  return undefined;
}

/**
 * Returns the default system library icon for an item name, ignoring custom overrides.
 */
export function getDefaultIcon(name: string): string | undefined {
  return getItemIcon(name, undefined);
}

/**
 * Get all available system icon entries: { name, url }
 */
export function getAllAvailableIcons(): { name: string; url: string }[] {
  return Object.entries(itemIcons).map(([name, filename]) => ({
    name,
    url: `${import.meta.env.BASE_URL}icons/${encodeURIComponent(filename)}`
  }));
}
