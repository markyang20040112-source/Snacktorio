import { dataService } from './dataService';
import { CalculationResult, ProcessNode, Item, FeederStrategy, Recipe, IntermediateRecipe, Machine, CalculatorProcess, DownstreamTarget } from '../types';
import { parseFractionOrNumber, formatFractionOrDecimal, gcdArray } from '../utils/math';
import { PROCESS_ACTION_VERBS, ITEM_ACTION_PREFIX } from '../utils/actionVerbs';
import { isUpstreamAncestor } from '../utils/itemTraits';
import { settlePlantInfrastructure } from './plantInfrastructure';

export {
  sizeAutonomousPump,
  settlePlantInfrastructure,
  type PlantInfrastructureInput,
  type PlantInfrastructureResult
} from './plantInfrastructure';

export function computeIntegerRatio(rates: number[]): number[] {
  if (rates.length === 0) return [];
  const ints = rates.map(r => Math.round(r * 10000));
  const g = gcdArray(ints);
  if (g <= 0) return rates.map(() => 1);
  return ints.map(val => Math.round(val / g));
}

/**
 * Downstream physical topology routing engine:
 * Dynamically resolves downstream machine connections and material distribution ratios
 */
const COOKED_GROUPS = [
  ['煮熟的千層麵皮', '千層麵皮', '千層麵'],
  ['煮熟的義大利麵', '義大利麵'],
  ['煮熟的通心粉', '通心粉'],
  ['炸薯條', '薯條'],
  ['炸多林多滋', '多林多滋', '玉米片'],
  ['軟質奶酪', '中等熟成奶酪', '硬質奶酪'],
  ['粉塵底料', '粉塵'],
  ['蟑螂黃油', '黃油'],
  ['蟑螂奶油', '奶油', '酸奶油'],
  ['香豆蔻', '豆肉蔻'],
  ['蛇蛋', '臭蛇蛋'],
  ['麵包麵團', '麵包麵糰', '發酵麵糰', '發酵麵團', '麵團', '麵糰']
];

const ACTION_VERBS = PROCESS_ACTION_VERBS;

function normalizeMatName(str: string): string {
  return str.replace(/麵糰/g, '麵團');
}

function isRawItem(name: string): boolean {
  return /^(生|生的|生鮮|生鮮的)/.test(name) && !/^(生產|生成)/.test(name);
}

function isTerrainOrPlant(name: string): boolean {
  if (!name) return true;
  return name.includes('(礦石方塊)') || name.includes('(香料方塊)') || name.endsWith('植株') || name.endsWith('塊莖');
}

function getBaseItemName(str: string): string {
  return normalizeMatName(str)
    .replace(/^(煮熟的|新鮮的|烘烤的|油炸的|生鮮的|熟的|生的|生|熟)/, '')
    .trim();
}

export function matchMaterial(prodItem: { name: string; isFluid: boolean }, reqItem: { name: string; isFluid: boolean }): boolean {
  if (prodItem.isFluid !== reqItem.isFluid) return false;
  const pNorm = normalizeMatName(prodItem.name);
  const rNorm = normalizeMatName(reqItem.name);
  if (pNorm === rNorm) return true;

  if ((pNorm === '·椒' || pNorm === '辣椒') && (rNorm === '·椒' || rNorm === '辣椒')) {
    return true;
  }

  // 泛用底料配對：任意物品 / 重構底料 / 底料 / 底料專供 互通
  const isGenericBase = (n: string) => n === '任意物品' || n === '重構底料' || n === '底料' || n === '底料專供' || n === '底料作物';
  if (isGenericBase(pNorm) && isGenericBase(rNorm)) {
    return true;
  }

  // 生熟嚴格隔離：生料（如生通心粉、生千層麵、生史萊姆肉丸）絕不可直供需熟料之設備（自動廚師機），必須經由熱加工烹飪設備（煮鍋、油炸鍋等）
  const pRaw = isRawItem(pNorm);
  const rRaw = isRawItem(rNorm);
  if (pRaw !== rRaw) {
    return false;
  }

  for (const group of COOKED_GROUPS) {
    const inProd = group.some(g => pNorm === normalizeMatName(g));
    const inReq = group.some(g => rNorm === normalizeMatName(g));
    if (inProd && inReq) return true;
  }

  // Adaptive base name fallback for arbitrary future user recipes
  const pBase = getBaseItemName(pNorm);
  const rBase = getBaseItemName(rNorm);
  if (pBase && rBase && pBase === rBase) return true;

  return false;
}

export function getProcessOutputItem(
  p: ProcessNode,
  dishName: string,
  intermediateRecipes: IntermediateRecipe[],
  allItems: Set<string>
): { name: string; isFluid: boolean } {
  if (p.machine === '自動廚師機') return { name: dishName, isFluid: false };
  if (p.processName.includes('底料作物採集') || p.processName.includes('底料專供') || p.processName.includes('任意物品')) {
    return { name: '重構底料', isFluid: false };
  }

  if (p.machine === '攪拌機') {
    const sauceName = p.processName.replace(/^(攪拌|萃取|熬煮|調配)/, '').replace(/\(.*\)/, '').trim();
    return { name: sauceName, isFluid: true };
  }
  if (p.machine === '注入機') {
    const injName = p.processName.replace(/^(注入|環境原位轉化)/, '').trim();
    return { name: injName, isFluid: true };
  }

  const baseClean = p.processName.replace(/\(.*?\)/g, '').trim();
  const stripped = baseClean.replace(ACTION_VERBS, '').trim();

  if (p.machine === '煮鍋') {
    const cookedName = '煮熟的' + stripped;
    if (allItems.has(cookedName)) return { name: cookedName, isFluid: false };
    if (allItems.has(cookedName + '皮')) return { name: cookedName + '皮', isFluid: false };
    const found = intermediateRecipes.find(r => r.machine === '煮鍋' && (r.name.includes(stripped) || stripped.includes(r.name)));
    if (found) return { name: found.name, isFluid: false };
  }

  if (p.machine === '擠出機') {
    const cleanP = stripped.replace('皮', '');
    const rawName = '生' + cleanP;
    if (allItems.has(rawName)) return { name: rawName, isFluid: false };
    if (p.processName.includes('鷹身女妖')) return { name: '生鷹身女妖肉', isFluid: false };
    const found = intermediateRecipes.find(r => r.machine === '擠出機' && (r.name.includes(cleanP) || cleanP.includes(r.name)));
    if (found) return { name: found.name, isFluid: false };
    return { name: rawName, isFluid: false };
  }

  if (p.machine === '研磨機') {
    if (p.processName.includes('史萊姆')) return { name: '史萊姆肉餡', isFluid: false };
    if (p.processName.includes('骨粉')) return { name: '骨粉', isFluid: false };
    if (p.processName.includes('麵包糠')) return { name: '麵包糠', isFluid: false };
    if (p.processName.includes('粉塵')) return { name: '粉塵', isFluid: false };
    if (p.processName.includes('芝士碎')) return { name: '芝士碎', isFluid: false };
  }

  if (p.machine === '混合機') {
    if (p.processName.includes('義大利麵團') || (p.processName.includes('麵團') && !p.processName.includes('麵包'))) {
      return { name: '義大利麵團', isFluid: false };
    }
    if (p.processName.includes('麵包麵團')) return { name: '麵包麵團', isFluid: false };
    if (p.processName.includes('塔瑪茄泥')) return { name: '塔瑪茄泥', isFluid: false };
    if (p.processName.includes('黃油')) return { name: '蟑螂黃油', isFluid: false };
    if (p.processName.includes('奶油')) return { name: '蟑螂奶油', isFluid: false };
    if (p.processName.includes('蒜泥蛋醬')) return { name: '蒜泥蛋醬', isFluid: false };
  }

  if (p.machine === '烤箱') {
    if (p.processName.includes('麵包')) return { name: '麵包', isFluid: false };
  }

  if (p.machine === '發酵罐') {
    if (p.processName.includes('奶酪')) return { name: '軟質奶酪', isFluid: false };
  }

  if (p.machine === '油炸鍋') {
    if (p.processName.includes('多林多滋')) return { name: '多林多滋', isFluid: false };
    if (p.processName.includes('薯條')) return { name: '薯條', isFluid: false };
  }

  let inter = intermediateRecipes.find(r => (r.name === stripped || r.name === p.processName || r.name === baseClean) && r.machine === p.machine);
  if (!inter) {
    inter = intermediateRecipes.find(r => r.machine === p.machine && (p.processName.endsWith(r.name) || baseClean.endsWith(r.name)));
  }
  if (!inter) {
    inter = intermediateRecipes.find(r => r.name === stripped || r.name === p.processName || r.name === baseClean);
  }
  if (!inter) {
    inter = intermediateRecipes.find(r => p.processName.endsWith(r.name) || baseClean.endsWith(r.name));
  }
  if (inter) return { name: inter.name, isFluid: false };

  // Fallback: check if processName ends with any known item name (e.g. 未知動詞+物品名)
  const sortedItems = Array.from(allItems).sort((a, b) => b.length - a.length);
  const matchedItem = sortedItems.find(iName => p.processName.endsWith(iName) || baseClean.endsWith(iName));
  if (matchedItem) return { name: matchedItem, isFluid: false };

  return { name: stripped, isFluid: false };
}

export function getProcessInputItems(
  p: ProcessNode,
  dishName: string,
  dishProcesses: ProcessNode[],
  recipes: Recipe[],
  intermediateRecipes: IntermediateRecipe[]
): { name: string; count: number; isFluid: boolean }[] {
  if (p.machine === '自動廚師機') {
    const dishRecipe = recipes.find(r => r.name === dishName);
    if (!dishRecipe) return [];
    const inputs = (dishRecipe.inputs || []).filter(i => i.name && i.name !== '無').map(i => ({ name: i.name, count: i.count, isFluid: false }));
    if (dishRecipe.fluidType && dishRecipe.fluidType !== '無') {
      inputs.push({ name: dishRecipe.fluidType, count: dishRecipe.fluidRate || 1, isFluid: true });
    }
    return inputs;
  }

  if (p.machine === '收割機' || p.machine === '採掘機') return [];
  if (p.machine === '物質操縱機') return [{ name: '重構底料', count: 1, isFluid: false }];

  const stripped = p.processName.replace(ACTION_VERBS, '').trim();
  const cleanP = stripped.replace('皮', '');

  if (p.processName.includes('麵糊')) {
    const hasSnake = dishProcesses.some(dp => dp.processName.includes('蛇蛋'));
    const eggName = hasSnake ? '蛇蛋' : '蜘蛛蛋';
    return [{ name: '骨粉', count: 1, isFluid: false }, { name: eggName, count: 1, isFluid: false }];
  }

  let candidates = intermediateRecipes.filter(r => 
    r.name === p.processName || r.name === stripped || r.name === cleanP ||
    r.name.includes(cleanP) || cleanP.includes(r.name)
  );

  if (candidates.some(c => c.machine === p.machine)) {
    candidates = candidates.filter(c => c.machine === p.machine);
  } else if (p.machine === '攪拌機') {
    // Keep sauce candidates even if categorized under 混合機
  } else {
    candidates = [];
  }

  let best: IntermediateRecipe | null = null;
  if (candidates.length === 1) {
    best = candidates[0];
  } else if (candidates.length > 1) {
    let bestScore = -1;
    for (const c of candidates) {
      let score = c.machine === p.machine ? 10 : 0;
      const inps = (c.inputs || []).filter(i => i.name && i.name !== '無');
      inps.forEach(inp => {
        if (dishProcesses.some(dp => dp.processName.includes(inp.name) || inp.name.includes(dp.processName))) score += 5;
      });
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }

  if (best) {
    const inputs = (best.inputs || []).filter(i => i.name && i.name !== '無').map(i => ({ name: i.name, count: i.count, isFluid: false }));
    if (best.fluidType && best.fluidType !== '無') {
      inputs.push({ name: best.fluidType, count: best.fluidRate || 1, isFluid: true });
    }
    return inputs;
  }

  // Fallbacks
  if (p.machine === '煮鍋') {
    return [{ name: '生' + cleanP, count: 1, isFluid: false }, { name: '水', count: 1, isFluid: true }];
  }
  if (p.machine === '油炸鍋') {
    if (p.processName.includes('薯條')) return [{ name: '生薯條', count: 1, isFluid: false }, { name: '油', count: 1, isFluid: true }];
    if (p.processName.includes('多林多滋')) return [{ name: '生多林多滋', count: 1, isFluid: false }, { name: '油', count: 1, isFluid: true }];
  }
  if (p.machine === '擠出機') {
    if (p.processName.includes('鷹身女妖')) return [{ name: '鷹身女妖翅膀', count: 1, isFluid: false }];
    if (p.processName.includes('薯條')) return [{ name: '土豆', count: 1, isFluid: false }, { name: '鹽', count: 1, isFluid: false }];
    return [{ name: '義大利麵團', count: 1, isFluid: false }];
  }
  if (p.machine === '研磨機') {
    if (p.processName.includes('史萊姆')) return [{ name: '綠色史萊姆', count: 1, isFluid: false }];
    if (p.processName.includes('粉塵')) return [{ name: '粉塵底料', count: 1, isFluid: false }];
    if (p.processName.includes('芝士碎')) return [{ name: '軟質奶酪', count: 1, isFluid: false }];
  }
  if (p.machine === '烤箱') {
    return [{ name: '麵包麵團', count: 1, isFluid: false }];
  }

  return [];
}

export function generateProcessesFromRecipe(
  dishName: string,
  recipes: Recipe[],
  intermediateRecipes: IntermediateRecipe[],
  items: Item[],
  machines: Machine[]
): CalculatorProcess[] {
  const dishRec = recipes.find(r => r.name === dishName);
  if (!dishRec) return [];

  const processes: CalculatorProcess[] = [];
  const machMap = new Map(machines.map(m => [m.name, m]));

  const outCnt = dishRec.outputCount || 1;
  const cycle = dishRec.cycleTime || 5;
  const chefBaseRate = outCnt / cycle;
  const chefMach = machMap.get('自動廚師機');

  let order = 1;

  // 1. 終端組裝工序
  processes.push({
    dish: dishName,
    processName: '終端組裝',
    machine: '自動廚師機',
    baseRate: chefBaseRate,
    power: chefMach?.power || 0,
    goblins: chefMach?.goblins || 1,
    order: order++
  });

  // 2. 廣度優先遍歷向上追溯原料與中間配方
  const queue: { name: string; reqPerDish: number; path: string[] }[] = [];
  (dishRec.inputs || []).forEach(inp => {
    if (inp.name && !['無', '任意物品', '無(空載)', '重構底料', '底料'].includes(inp.name) && inp.count > 0) {
      queue.push({ name: inp.name, reqPerDish: inp.count / outCnt, path: [dishName] });
    }
  });

  if (dishRec.fluidType && !['無', '水', '油', '虛空'].includes(dishRec.fluidType)) {
    const fRate = dishRec.fluidRate || 1;
    const dishCycle = dishRec.cycleTime || 5;
    // 終端組裝單次耗時 dishCycle 秒，持續通入 fRate fl/s，單次耗水量 = fRate * dishCycle，產出 outCnt 份料理
    queue.push({ name: dishRec.fluidType, reqPerDish: (fRate * dishCycle) / outCnt, path: [dishName] });
  }

  interface InterNodeData {
    recipe: IntermediateRecipe;
    countPerDish: number;
  }
  const interMap = new Map<string, InterNodeData>();
  const rawMap = new Map<string, { machine: string; countPerDish: number }>();

  while (queue.length > 0) {
    const { name, reqPerDish, path } = queue.shift()!;
    if (!name || ['無', '任意物品', '無(空載)', '重構底料', '底料'].includes(name)) {
      continue;
    }

    const inter = intermediateRecipes.find(r => r.name === name);
    if (inter) {
      const ikey = inter.name;

      // 原位轉化機制 (Injector In-situ Transformation Rule):
      // 注入機直接置於環境池中，單道料理只需 1 台注入機原位轉化，單次固定消耗 1 個辛香料 (0.2/s)，不隨下游流體抽取量倍增。
      if (inter.machine === '注入機') {
        if (!interMap.has(ikey)) {
          interMap.set(ikey, { recipe: inter, countPerDish: 1 });
          const newPath = [...path, ikey];
          (inter.inputs || []).forEach(inp => {
            if (inp.name && !['無', '任意物品', '無(空載)', '重構底料', '底料'].includes(inp.name) && inp.count > 0) {
              queue.push({ name: inp.name, reqPerDish: inp.count * 1, path: newPath });
            }
          });
        }
        continue;
      }

      if (!interMap.has(ikey)) {
        interMap.set(ikey, { recipe: inter, countPerDish: 0 });
      }
      interMap.get(ikey)!.countPerDish += reqPerDish;

      // DAG 死循環防護：若在同一溯源路徑中重複出現則中斷；但允許多個不同下游工序匯流消費同一中間物料
      if (path.includes(ikey)) {
        continue;
      }

      const iOut = inter.outputCount || 1;
      const iCycle = inter.cycleTime || 5;
      const cycles = reqPerDish / iOut;
      const newPath = [...path, ikey];

      (inter.inputs || []).forEach(inp => {
        if (inp.name && !['無', '任意物品', '無(空載)', '重構底料', '底料'].includes(inp.name) && inp.count > 0) {
          queue.push({ name: inp.name, reqPerDish: inp.count * cycles, path: newPath });
        }
      });
      if (inter.fluidType && !['無', '水', '油', '虛空'].includes(inter.fluidType)) {
        const fRate = inter.fluidRate || 1;
        // 中間工序單週期耗時 iCycle 秒，持續通入 fRate fl/s，每週期耗液量 = fRate * iCycle
        queue.push({ name: inter.fluidType, reqPerDish: fRate * iCycle * cycles, path: newPath });
      }
    } else {
      if (isTerrainOrPlant(name)) {
        continue;
      }
      const it = items.find(i => i.name === name);
      let harvestMach = '收割機';
      const src = it?.source || '';
      if (src.includes('採掘') || src.includes('礦') || ['鹽', '石', '粉'].some(k => name.includes(k))) {
        harvestMach = '採掘機';
      } else if (src.includes('物質操縱') || src.includes('異界') || src.includes('重構') || ['史萊姆', '蟑螂', '蜘蛛', '蛇蛋', '骸骨', '仙子'].some(k => name.includes(k))) {
        harvestMach = '物質操縱機';
      }

      if (!rawMap.has(name)) {
        rawMap.set(name, { machine: harvestMach, countPerDish: 0 });
      }
      rawMap.get(name)!.countPerDish += reqPerDish;
    }
  }

  // 3. 轉換中間配方為工序節點
  const getVerb = (machine: string, rName: string): string => {
    if (ACTION_VERBS.test(rName)) return '';
    switch (machine) {
      case '物質操縱機': return '重構';
      case '採掘機': return '開採';
      case '收割機': return '採收';
      case '混合機': return '混和';
      case '烤箱': return '烘烤';
      case '發酵罐': return '發酵';
      case '油炸鍋': return '炸';
      case '研磨機': return '研磨';
      case '擠出機': return '擠出';
      case '煮鍋': return '水煮';
      case '攪拌機': return '攪拌';
      case '注入機': return '';
      default: return '';
    }
  };

  interMap.forEach(data => {
    const r = data.recipe;
    const totalReq = data.countPerDish;
    const rOut = r.outputCount || 1;
    const rCycle = r.cycleTime || 5;
    const baseRate = totalReq > 0 ? (rOut / rCycle) / totalReq : (rOut / rCycle);
    const mInfo = machMap.get(r.machine);
    const pname = getVerb(r.machine, r.name) + r.name;

    processes.push({
      dish: dishName,
      processName: pname,
      machine: r.machine,
      baseRate,
      power: mInfo?.power || 0,
      goblins: mInfo?.goblins || 1,
      order: order++
    });
  });

  // 4. 轉換基礎原物料採集為工序節點
  rawMap.forEach((data, rkey) => {
    const totalReq = data.countPerDish;
    const mach = data.machine;
    let stdRate = 0.2;
    let pname = '採收' + rkey;

    if (mach === '採掘機') {
      pname = '開採' + rkey;
      stdRate = 0.2;
    } else if (mach === '物質操縱機') {
      pname = '重構' + rkey;
      stdRate = (rkey.includes('蟑螂') || rkey.includes('史萊姆') || rkey.includes('骸骨')) ? 0.4 : 0.2;
    }

    const baseRate = totalReq > 0 ? stdRate / totalReq : stdRate;
    const mInfo = machMap.get(mach);

    processes.push({
      dish: dishName,
      processName: pname,
      machine: mach,
      baseRate,
      power: mInfo?.power || 0,
      goblins: mInfo?.goblins || 1,
      order: order++
    });
  });

  return processes;
}

export function getProcessItemOutputRate(
  processName: string,
  machine: string,
  intermediateRecipes: IntermediateRecipe[]
): number {
  const stripped = processName.replace(ACTION_VERBS, '').trim();
  let inter = intermediateRecipes.find(r => (r.name === stripped || r.name === processName) && r.machine === machine);
  if (!inter) {
    inter = intermediateRecipes.find(r => r.machine === machine && (r.name.includes(stripped) || stripped.includes(r.name)));
  }
  if (!inter) {
    inter = intermediateRecipes.find(r => r.machine === machine && processName.endsWith(r.name));
  }
  if (!inter) {
    inter = intermediateRecipes.find(r => r.machine === machine && (processName.includes(r.name) || r.name.includes(stripped)));
  }
  if (inter) {
    const outCnt = inter.outputCount || 1;
    const cycle = inter.cycleTime || 5;
    return outCnt / cycle;
  }
  // Default extraction rates for 5s cycle machines
  if (machine === '物質操縱機') {
    if (['蟑螂', '史萊姆', '骸骨'].some(k => processName.includes(k))) {
      return 2 / 5; // 0.4 items/s
    }
    return 1 / 5; // 0.2 items/s
  }
  return 1 / 5; // 0.2 items/s for 採掘機, 收割機, etc.
}

function getProcessMaxOutputRate(
  proc: { processName: string; machine: string; countRounded?: number; parallelRounded?: number },
  allProcesses: { processName: string; machine: string; countRounded?: number; parallelRounded?: number }[],
  intermediateRecipes: IntermediateRecipe[],
  visited: Set<any> = new Set()
): number {
  if (visited.has(proc)) return 0;
  visited.add(proc);

  const rounded = proc.parallelRounded !== undefined ? proc.parallelRounded : (proc.countRounded || 0);
  const rOut = getProcessItemOutputRate(proc.processName, proc.machine, intermediateRecipes);
  const nominalCapacity = rounded * rOut;

  // Primary extractors mine from infinite natural resources (veins, ground, crops)
  if (proc.machine === '採掘機' || proc.machine === '收割機' || proc.machine === '虛空泵機') {
    return nominalCapacity;
  }

  // Intermediate machines: check upstream supplier constraints
  const stripped = proc.processName.replace(ACTION_VERBS, '').trim();
  let inter = intermediateRecipes.find(r => (r.name === stripped || r.name === proc.processName) && r.machine === proc.machine);
  if (!inter) {
    inter = intermediateRecipes.find(r => r.machine === proc.machine && (r.name.includes(stripped) || stripped.includes(r.name)));
  }
  if (!inter) {
    inter = intermediateRecipes.find(r => r.machine === proc.machine && (proc.processName.endsWith(r.name) || proc.processName.includes(r.name)));
  }

  if (!inter || !inter.inputs || inter.inputs.length === 0) {
    return nominalCapacity;
  }

  const outCnt = inter.outputCount || 1;
  let maxSupportedRate = nominalCapacity;

  for (const inp of inter.inputs) {
    if (!inp.name || ['無', '任意物品', '無(空載)', '重構底料', '底料'].includes(inp.name) || inp.count <= 0) {
      continue;
    }

    // Find upstream process producing this input
    const upProc = allProcesses.find(p => {
      const upStripped = p.processName.replace(ACTION_VERBS, '').trim();
      return p !== proc && (upStripped === inp.name || p.processName === inp.name || p.processName.includes(inp.name));
    });

    if (upProc) {
      const upSupply = getProcessMaxOutputRate(upProc, allProcesses, intermediateRecipes, visited);
      // Each cycle produces outCnt and requires inp.count of this input
      const supportedRate = (upSupply / inp.count) * outCnt;
      if (supportedRate < maxSupportedRate) {
        maxSupportedRate = supportedRate;
      }
    }
  }

  return Math.min(nominalCapacity, maxSupportedRate);
}

/**
 * Quantifies the realistic physical surplus production rate (items/second) of a process,
 * taking into account both machine capacity and upstream material supply throttling.
 */
export function getProcessRealSurplusRate(
  proc: { processName: string; machine: string; countRounded?: number; parallelRounded?: number; totalDemandRate?: number; demandRate?: number },
  allProcesses: { processName: string; machine: string; countRounded?: number; parallelRounded?: number; totalDemandRate?: number; demandRate?: number }[],
  intermediateRecipes: IntermediateRecipe[]
): number {
  const rounded = proc.parallelRounded !== undefined ? proc.parallelRounded : (proc.countRounded || 0);
  const demand = proc.totalDemandRate !== undefined ? proc.totalDemandRate : (proc.demandRate || 0);

  if (rounded <= demand) return 0;

  const rOut = getProcessItemOutputRate(proc.processName, proc.machine, intermediateRecipes);
  const culinaryDemandRate = demand * rOut;
  const effectiveMaxOutput = getProcessMaxOutputRate(proc, allProcesses, intermediateRecipes);

  return Math.max(0, effectiveMaxOutput - culinaryDemandRate);
}

export function sortProcessesDownstreamToUpstream<T extends {
  processName: string;
  machine: string;
  isBaseFeeder?: boolean;
  downstreamTargets?: any[];
  tier?: number;
}>(processes: T[]): T[] {
  const tierMap = new Map<string, number>();

  // 1. Identify Terminal / Outermost downstream nodes (Tier 0)
  processes.forEach(p => {
    if (
      p.machine === '自動廚師機' ||
      p.processName.includes('終端出餐') ||
      p.processName.includes('終端組裝')
    ) {
      tierMap.set(p.processName, 0);
    }
  });

  // Helper to extract downstream target names and machines
  const getDownstreamTargets = (p: T): { name: string; machine?: string }[] => {
    const list: { name: string; machine?: string }[] = [];
    if (!p.downstreamTargets) return list;

    p.downstreamTargets.forEach((item: any) => {
      if (item && item.targets && Array.isArray(item.targets)) {
        item.targets.forEach((t: any) => {
          if (t && t.processName) list.push({ name: t.processName, machine: t.machine });
        });
      } else if (item && item.processName) {
        list.push({ name: item.processName, machine: item.machine });
      }
    });
    return list;
  };

  // 2. Iterative relaxation to calculate topological distance to terminal (Tier 1, Tier 2, etc.)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < processes.length + 5) {
    changed = false;
    iterations++;

    processes.forEach(p => {
      if (p.isBaseFeeder) return;
      const currentTier = tierMap.get(p.processName);
      const dsTargets = getDownstreamTargets(p);

      const reachableTiers: number[] = [];
      dsTargets.forEach(tgt => {
        processes.forEach(other => {
          if (other === p) return;
          const matches =
            other.processName === tgt.name ||
            (tgt.name !== '底料原料' && (other.processName.includes(tgt.name) || tgt.name.includes(other.processName))) ||
            (tgt.machine === '自動廚師機' && other.machine === '自動廚師機');

          if (matches) {
            const t = tierMap.get(other.processName);
            if (t !== undefined) {
              reachableTiers.push(t);
            }
          }
        });
      });

      if (reachableTiers.length > 0) {
        const minT = Math.min(...reachableTiers);
        const calculatedTier = minT + 1;
        if (currentTier === undefined || calculatedTier < currentTier) {
          tierMap.set(p.processName, calculatedTier);
          changed = true;
        }
      }
    });
  }

  // 3. Assign base feeders to highest tier (999) and fallback for unreached nodes
  processes.forEach(p => {
    if (p.isBaseFeeder) {
      tierMap.set(p.processName, 999);
    } else if (!tierMap.has(p.processName)) {
      if (p.machine === '採掘機' || p.machine === '收割機') {
        tierMap.set(p.processName, 80);
      } else if (p.machine === '物質操縱機') {
        tierMap.set(p.processName, 70);
      } else {
        tierMap.set(p.processName, 50);
      }
    }
  });

  // Assign tier property to each node
  processes.forEach(p => {
    p.tier = tierMap.get(p.processName) ?? 50;
  });

  // 4. Sort:
  // 1) Tier ASC (0, 1, 2...)
  // 2) Machine type (grouping same machine in same tier together)
  // 3) Process name
  return [...processes].sort((a, b) => {
    const tierA = tierMap.get(a.processName) ?? 50;
    const tierB = tierMap.get(b.processName) ?? 50;
    if (tierA !== tierB) return tierA - tierB;

    const machCmp = a.machine.localeCompare(b.machine, 'zh-Hant');
    if (machCmp !== 0) return machCmp;

    return a.processName.localeCompare(b.processName, 'zh-Hant');
  });
}

export function calculateSingleDish(
  dishName: string,
  targetRate: number, // dishes/s (e.g. 0.2)
  powerMode: 'regular' | 'overclock' = 'regular',
  feederStrategy: FeederStrategy = 'dedicated'
): CalculationResult | null {
  const calcDb = dataService.getCalculatorDb();
  const machines = dataService.getMachines();
  const items = dataService.getItems();
  const recipes = dataService.getRecipes();
  const intermediateRecipes = dataService.getIntermediateRecipes();

  // 1. Get processes for this dish
  let processesRaw = calcDb.processes.filter(p => p.dish === dishName);
  if (processesRaw.length === 0) {
    const r = recipes.find(rec => rec.name === dishName);
    if (!r) return null;
    processesRaw = generateProcessesFromRecipe(dishName, recipes, intermediateRecipes, items, machines);
  }

  const machineMap = new Map(machines.map(m => [m.name, m]));
  const processNodes: ProcessNode[] = [];

  for (const p of processesRaw) {
    const mach = machineMap.get(p.machine);
    const powerPerUnit = mach ? mach.power : p.power;
    const goblinsPerUnit = mach ? mach.goblins : p.goblins;
    const baseRateNum = parseFractionOrNumber(p.baseRate);

    const demandRate = baseRateNum > 0 ? targetRate / baseRateNum : 0;
    const countExact = demandRate;
    const countRounded = Math.ceil(demandRate);

    const warnings: string[] = [];
    if (p.machine === '混合機') {
      warnings.push('流體消耗特殊值：固定 0.5 fl/s (4秒2fl)');
    }
    if (p.machine === '攪拌機') {
      warnings.push('1:1 獨立專線直供（多台嚴禁合流為單管）');
    }
    if (p.machine === '注入機') {
      warnings.push('環境原位轉化：於水池/油池原位轉化，需專屬泵機抽取');
    }
    if (p.machine === '物質操縱機') {
      warnings.push('異界重構：每台需 1.0 fl/s 虛空 ＋ 1 台底料收割機');
    }
    const matchingInter = intermediateRecipes.find(r => r.name === p.processName);
    if (p.machine !== '物質操縱機' && matchingInter && matchingInter.inputs?.some(inp => ['任意物品', '重構底料', '底料'].includes(inp.name))) {
      warnings.push('泛用底料供給：每台需 1 台底料收割機直供任意原料');
    }

    processNodes.push({
      processName: p.processName,
      machine: p.machine,
      baseRate: baseRateNum,
      baseRateDisplay: formatFractionOrDecimal(baseRateNum, p.baseRate),
      demandRate,
      countExact,
      countRounded,
      power: countRounded * powerPerUnit,
      goblins: countRounded * goblinsPerUnit,
      integerRatio: 1,
      fluidRate: mach?.fluidRate || 0,
      fluidType: mach?.fluidType || '無',
      topology: '',
      warnings
    });
  }

  // 2. Integer Ratios (GCD) and Dynamic Downstream Routing Topology
  const counts = processNodes.map(p => p.countRounded);
  const commonGcd = gcdArray(counts);
  processNodes.forEach(p => {
    p.integerRatio = commonGcd > 0 ? p.countRounded / commonGcd : p.countRounded;
  });

  const allItemsSet = new Set<string>();
  items.forEach(i => allItemsSet.add(i.name));
  recipes.forEach(r => {
    allItemsSet.add(r.name);
    (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
    if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
  });
  intermediateRecipes.forEach(r => {
    allItemsSet.add(r.name);
    (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
    if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
  });

  // Map each process node to its output product and input requirements
  const nodeContexts = processNodes.map(p => ({
    node: p,
    output: getProcessOutputItem(p, dishName, intermediateRecipes, allItemsSet),
    inputs: getProcessInputItems(p, dishName, processNodes, recipes, intermediateRecipes)
  }));

  // Identify base consumer nodes (machines consuming 任意物品 / 重構底料, e.g. 物質操縱機, 烤箱等)
  const baseConsumerNodes = processNodes.filter(p => {
    if (p.machine === '物質操縱機') return true;
    const ctx = nodeContexts.find(nc => nc.node === p);
    if (ctx && ctx.inputs.some(inp => ['任意物品', '重構底料', '底料'].includes(inp.name))) {
      return true;
    }
    const inter = intermediateRecipes.find(r => r.name === p.processName);
    if (inter && inter.inputs?.some(inp => ['任意物品', '重構底料', '底料'].includes(inp.name))) {
      return true;
    }
    return false;
  });

  const baseConsumerCount = baseConsumerNodes.reduce((sum, p) => sum + p.countRounded, 0);
  const consumerMachines = Array.from(new Set(baseConsumerNodes.map(p => p.machine)));
  const primaryConsumerMachine = consumerMachines.length === 1
    ? consumerMachines[0]
    : (consumerMachines.length > 1 ? consumerMachines.join('、') : '物質操縱機');

  nodeContexts.forEach(curr => {
    if (curr.node.machine === '自動廚師機') {
      curr.node.topology = '終端出餐 (大炮發射)';
      curr.node.downstreamTargets = [];
      return;
    }

    // Find downstream consumer processes
    const consumers: { target: ProcessNode; reqCount: number; isFluid: boolean }[] = [];
    nodeContexts.forEach(other => {
      if (other === curr) return;
      const matchingInput = other.inputs.find(inp => matchMaterial(curr.output, inp));
      if (matchingInput) {
        // Dedicated pipeline isolation: if current process specifies a dedicated target in parentheses
        // like (廚師機專線), (奶油專線), (奶酪專線), (黃油專線), only link to that matching machine/process
        if (curr.node.processName.includes('(') && curr.node.processName.includes('專線)')) {
          const match = curr.node.processName.match(/\((.*?)專線\)/);
          if (match) {
            const hint = match[1];
            const isMatch = other.node.machine.includes(hint) ||
                            other.node.processName.includes(hint);
            if (!isMatch) return;
          }
        }
        consumers.push({
          target: other.node,
          reqCount: matchingInput.count || 1,
          isFluid: matchingInput.isFluid
        });
      }
    });

    if (consumers.length === 0) {
      if (curr.output.isFluid) {
        curr.node.topology = `專線直供【終端組裝】(自動廚師機) (1.0 fl/s)`;
        curr.node.downstreamTargets = [{
          processName: '終端組裝',
          machine: '自動廚師機',
          ratio: 1,
          isFluid: true,
          note: '1.0 fl/s'
        }];
      } else if (curr.node.processName.includes('底料作物採集') || curr.node.processName.includes('底料專供') || curr.node.processName.includes('任意物品')) {
        const targetMach = primaryConsumerMachine || '物質操縱機';
        curr.node.topology = `直供【${targetMach}】(底料原料)`;
        curr.node.downstreamTargets = [{
          processName: '底料原料',
          machine: targetMach,
          ratio: 1
        }];
      } else {
        curr.node.topology = '連至【終端組裝】(自動廚師機)';
        curr.node.downstreamTargets = [{
          processName: '終端組裝',
          machine: '自動廚師機',
          ratio: 1
        }];
      }
    } else if (consumers.length === 1) {
      const c = consumers[0];
      const targetCycle = recipes.find(r => r.name === c.target.processName)?.cycleTime
        || intermediateRecipes.find(r => r.name === c.target.processName || c.target.processName.includes(r.name))?.cycleTime
        || (c.target.machine === '混合機' ? 4 : 5);
      const perMachineRate = (c.reqCount || 1) / targetCycle;
      const flowRate = (c.target.demandRate || c.target.countRounded) * perMachineRate;
      const mCount = c.target.countRounded || 1;

      if (c.isFluid) {
        const rateVal = c.reqCount || (c.target.machine === '混合機' ? 0.5 : 1.0);
        const rateStr = `${rateVal} fl/s`;
        curr.node.topology = `專線直供【${c.target.processName}】(${c.target.machine}) (${rateStr})`;
        if (mCount > 1) {
          curr.node.downstreamTargets = Array.from({ length: mCount }, () => ({
            processName: c.target.processName,
            machine: c.target.machine,
            ratio: 1,
            flowRate: flowRate / mCount,
            isFluid: true,
            note: rateStr
          }));
        } else {
          curr.node.downstreamTargets = [{
            processName: c.target.processName,
            machine: c.target.machine,
            ratio: 1,
            flowRate,
            isFluid: true,
            note: rateStr
          }];
        }
      } else {
        curr.node.topology = `連至【${c.target.processName}】(${c.target.machine})`;
        if (mCount > 1) {
          curr.node.downstreamTargets = Array.from({ length: mCount }, () => ({
            processName: c.target.processName,
            machine: c.target.machine,
            ratio: 1,
            flowRate: flowRate / mCount
          }));
        } else {
          curr.node.downstreamTargets = [{
            processName: c.target.processName,
            machine: c.target.machine,
            ratio: 1,
            flowRate
          }];
        }
      }
    } else {
      const flowRates = consumers.map(c => {
        const targetCycle = recipes.find(r => r.name === c.target.processName)?.cycleTime
          || intermediateRecipes.find(r => r.name === c.target.processName || c.target.processName.includes(r.name))?.cycleTime
          || (c.target.machine === '混合機' ? 4 : 5);
        const perMachineRate = (c.reqCount || 1) / targetCycle;
        return (c.target.demandRate || c.target.countRounded) * perMachineRate;
      });
      const intRatios = computeIntegerRatio(flowRates);
      const ratioStr = intRatios.join(' : ');
      const desc = consumers.length === 2
        ? `【${consumers[0].target.processName}】(${consumers[0].target.machine}) 與【${consumers[1].target.processName}】(${consumers[1].target.machine})`
        : consumers.slice(0, -1).map(c => `【${c.target.processName}】(${c.target.machine})`).join('、') + ` 與【${consumers[consumers.length - 1].target.processName}】(${consumers[consumers.length - 1].target.machine})`;
      curr.node.topology = `分流至${desc} 配比 ${ratioStr}`;

      const expandedTargets: DownstreamTarget[] = [];
      consumers.forEach((c, idx) => {
        const r = intRatios[idx];
        const mCount = c.target.countRounded || 1;
        // 若下游工序包含多台實體設備，且配比可被台數整除 (如 2 台攪拌機各拿 1 份流量，配比為 2；或各拿 2 份，配比為 4)：
        // 拆分為獨立實體設備徽章，使玩家能直觀看清獨立台數與各自的入料份數
        if (mCount > 1 && r >= mCount && r % mCount === 0) {
          const perMachineRatio = r / mCount;
          for (let m = 0; m < mCount; m++) {
            expandedTargets.push({
              processName: c.target.processName,
              machine: c.target.machine,
              ratio: perMachineRatio,
              flowRate: flowRates[idx] / mCount,
              isFluid: c.isFluid
            });
          }
        } else {
          expandedTargets.push({
            processName: c.target.processName,
            machine: c.target.machine,
            ratio: r,
            flowRate: flowRates[idx],
            isFluid: c.isFluid
          });
        }
      });
      curr.node.downstreamTargets = expandedTargets;
    }
  });

  // 先行計算拓撲層級 (tier)，以利底料起始啟動機依層級深度進行最優評選
  sortProcessesDownstreamToUpstream(processNodes);

  // 3. 泛用底料收割機 (Base Feeder Harvesters - 物質操縱機或任何需「任意物品/底料」之設備)
  let offsetCount = 0;
  let offsetSource = '';

  if (feederStrategy === 'recycle' && baseConsumerCount > 0) {
    // 檢查產線中是否有具備過剩產能的固體中間加工工序 (排除終端組裝、純流體與發電機，以及底料消耗設備自身)
    const nonDonorMachines = ['自動廚師機', ...consumerMachines, '物質操縱機', '攪拌機', '注入機', '虛空熔爐', '虛空泵機', '收割機', '採掘機'];
    const candidateNodes = processNodes.filter(p => 
      !nonDonorMachines.includes(p.machine) &&
      p.countRounded > p.demandRate
    );

    // 標記提供過剩產能的供給設備 (Donor)
    const donorNodes = candidateNodes.filter(p => {
      const surplusRate = getProcessRealSurplusRate(p, processNodes, intermediateRecipes);
      return surplusRate >= 0.199;
    });

    let totalOffsetAvailable = 0;
    const sources: string[] = [];

    donorNodes.forEach(p => {
      const surplusRate = getProcessRealSurplusRate(p, processNodes, intermediateRecipes);
      const potential = Math.floor((surplusRate + 0.001) / 0.2);
      if (potential > 0) {
        totalOffsetAvailable += potential;
        sources.push(`【${p.processName}】過剩 ${surplusRate.toFixed(2)}/s`);
      }
    });

    if (totalOffsetAvailable > 0) {
      const manipulators = baseConsumerNodes;

      // 動態分析：判斷是否有候選過剩工序的原料鏈向上依賴本料理中的某台底料設備產物 (Chicken-and-Egg 死鎖防護)
      // 若依賴某台設備，該設備即為「起始啟動機 (Progenitor)」，必須保留其專屬底料收割機啟動鏈條
      const progenitorManipulators = manipulators.filter(m => {
        const mProduct = m.processName.replace('重構', '').replace('物質操縱', '').trim();
        return donorNodes.some(c => isUpstreamAncestor(c.processName, mProduct, intermediateRecipes));
      });

      const hasManipulatorChain = progenitorManipulators.length > 0;
      const maxAllowed = hasManipulatorChain ? Math.max(0, baseConsumerCount - 1) : baseConsumerCount;

      const canDonate = (donorNode: ProcessNode, recNode: ProcessNode) => {
        const recProduct = recNode.processName.replace('重構', '').replace('物質操縱', '').trim();
        const dependsOnRec = isUpstreamAncestor(donorNode.processName, recProduct, intermediateRecipes);
        return !dependsOnRec;
      };

      const getDonorSupplier = (donorNode: ProcessNode) => {
        return manipulators.find(m => {
          const mProduct = m.processName.replace('重構', '').replace('物質操縱', '').trim();
          return isUpstreamAncestor(donorNode.processName, mProduct, intermediateRecipes);
        });
      };

      // 遍歷所有候選起始機 (若有祖源依賴則限定於 progenitorManipulators，否則為全體 manipulators)
      // 透過二分圖約束排序，挑選能達成最多折抵、且最順暢正向拓撲之最佳分配方案
      const candidateRoots = hasManipulatorChain ? progenitorManipulators : (manipulators.length > 0 ? [manipulators[0]] : []);
      let bestMatching: {
        root: ProcessNode;
        matchedCount: number;
        donorSlots: { donor: ProcessNode; surplusRate: number; available: number; recipients: ProcessNode[] }[];
        score: number;
      } | null = null;

      for (const candRoot of candidateRoots) {
        const recipients = manipulators.filter(m => m !== candRoot).slice(0, maxAllowed);
        const donorSlots = donorNodes.map(d => {
          const surplusRate = getProcessRealSurplusRate(d, processNodes, intermediateRecipes);
          return {
            donor: d,
            supplier: getDonorSupplier(d),
            surplusRate,
            available: Math.floor((surplusRate + 0.001) / 0.2),
            recipients: [] as ProcessNode[]
          };
        });

        recipients.sort((a, b) => {
          const countA = donorSlots.filter(ds => canDonate(ds.donor, a)).length;
          const countB = donorSlots.filter(ds => canDonate(ds.donor, b)).length;
          return countA - countB;
        });

        let matchedCount = 0;
        for (const rec of recipients) {
          const available = donorSlots.filter(ds => ds.available > 0 && canDonate(ds.donor, rec));
          if (available.length > 0) {
            available.sort((d1, d2) => {
              const t1 = recipients.filter(r => canDonate(d1.donor, r)).length;
              const t2 = recipients.filter(r => canDonate(d2.donor, r)).length;
              return t1 - t2;
            });
            const chosen = available[0];
            chosen.recipients.push(rec);
            chosen.available--;
            matchedCount++;
          }
        }

        const candRootSuppliesDonor = donorSlots.some(ds => ds.supplier === candRoot && ds.recipients.length > 0);
        const score = matchedCount * 100 + (candRootSuppliesDonor ? 10 : 0) + (50 - (candRoot.tier ?? 50));

        if (!bestMatching || score > bestMatching.score) {
          bestMatching = {
            root: candRoot,
            matchedCount,
            donorSlots,
            score
          };
        }
      }

      const donorSlots = bestMatching ? bestMatching.donorSlots : [];
      offsetCount = bestMatching ? Math.min(bestMatching.matchedCount, maxAllowed) : 0;

      if (offsetCount > 0) {
        const actualSources: string[] = [];
        donorSlots.forEach(ds => {
          const d = ds.donor;
          if (ds.recipients.length > 0) {
            d.feederRole = 'donor';
            const recNames = ds.recipients.map(r => `【${r.processName}】`).join('、');
            d.feederNote = `產能過剩，分流直供${recNames}作為底料 (${ds.surplusRate.toFixed(2)}/s)`;
            actualSources.push(`【${d.processName}】過剩直供${recNames}`);

            if (!d.downstreamTargets) d.downstreamTargets = [];
            ds.recipients.forEach(r => {
              d.downstreamTargets!.push({
                processName: r.processName,
                machine: r.machine,
                ratio: 1,
                flowRate: 0.20,
                isByproduct: true,
                note: '副產物折抵'
              });
              r.feederRole = 'recipient';
              r.feederNote = `底料由【${d.processName}】過剩產能直供 (省 1 底料機)`;
            });

            // 依據供餐需量與底料消耗之真實物理流率，動態重算分流配比 (最簡整數比)
            if (d.downstreamTargets.length > 1) {
              const allRates = d.downstreamTargets.map(t => t.flowRate !== undefined ? t.flowRate : 0.20);
              const intRatios = computeIntegerRatio(allRates);
              d.downstreamTargets.forEach((t, idx) => {
                t.ratio = intRatios[idx];
              });
            }
          }
        });

        if (actualSources.length > 0) {
          offsetSource = `由${actualSources.join('、')} (折抵 ${offsetCount} 台)`;
        }
      }
    }
  }

  const finalFeederCount = Math.max(0, baseConsumerCount - offsetCount);
  const baseFeeders = {
    strategy: feederStrategy,
    grossRequired: baseConsumerCount,
    offsetCount,
    count: finalFeederCount,
    offsetSource: offsetSource || undefined,
    power: finalFeederCount * 1.0, // 1 FV/s per feeder
    goblins: finalFeederCount * 1.0, // 1 goblin per feeder
    consumerMachine: primaryConsumerMachine,
    consumerMachines: consumerMachines.length > 0 ? consumerMachines : ['物質操縱機']
  };

  // 4. Fluids System (Four-Quadrant Dashboard Structure)
  // (A) Quadrant 2: 調配醬汁 (Sauces 1:1 dedicated pipes)
  const sauces: { name: string; rate: number; dedicatedPipes: number }[] = [];
  processNodes.filter(p => p.machine === '攪拌機').forEach(p => {
    sauces.push({
      name: p.processName,
      rate: p.countRounded * 1.0,
      dedicatedPipes: p.countRounded
    });
  });

  // (B) Quadrant 3: 轉化流體專屬抽取泵機 (In-situ Transformation Pumps)
  const hasInjector = processNodes.some(p => p.machine === '注入機' || p.processName.includes('注入'));

  // (C) Quadrant 4: 外採流體 (水、油、虛空)
  const materialsRaw = calcDb.materials.filter(m => m.dish === dishName);
  let baseWater = 0;
  let baseOil = 0;
  let baseVoid = 0;

  if (materialsRaw.length > 0) {
    for (const m of materialsRaw) {
      const amt = parseFractionOrNumber(m.amount);
      const matName = m.material.toLowerCase();
      if (matName.includes('水') || matName.includes('water')) {
        baseWater += amt;
      } else if (matName.includes('油') || matName.includes('oil')) {
        baseOil += amt;
      } else if (matName.includes('虛空') || matName.includes('void')) {
        baseVoid += amt;
      }
    }
  } else {
    // Dynamic derivation of fluid BOM for custom dishes
    const dishRecipe = recipes.find(r => r.name === dishName);
    if (dishRecipe) {
      if (dishRecipe.fluidType === '水') baseWater += (dishRecipe.fluidRate || 1.0);
      else if (dishRecipe.fluidType === '油') baseOil += (dishRecipe.fluidRate || 1.0);
      else if (dishRecipe.fluidType === '虛空') baseVoid += (dishRecipe.fluidRate || 1.0);

      processNodes.forEach(p => {
        if (p.machine === '自動廚師機') return;
        const inter = intermediateRecipes.find(r => r.name === p.processName || p.processName.includes(r.name));
        const fType = inter?.fluidType;
        if (p.machine === '煮鍋' && fType !== '醋') baseWater += 1.0;
        else if (p.machine === '油炸鍋' && fType !== '炙烈紅油') baseOil += 1.0;
        else if (p.machine === '物質操縱機') baseVoid += 1.0;
        else if (p.machine === '混合機') {
          if (fType === '水') baseWater += (inter?.fluidRate || 0.5);
          else if (fType === '油') baseOil += (inter?.fluidRate || 0.5);
          else if (fType === '虛空') baseVoid += (inter?.fluidRate || 1.0);
        }
      });
    }
  }

  const dishRecipe = recipes.find(r => r.name === dishName);
  const chefBaseRate = 0.2 * (dishRecipe?.outputCount || 1);
  const rateFactor = targetRate / (chefBaseRate > 0 ? chefBaseRate : 0.2);
  const demandWaterRaw = baseWater * rateFactor;
  const demandOilRaw = baseOil * rateFactor;

  // Dual-Tier Node Engine fallback validation matching Excel N9 and N10:
  // Water: MAX(BOM, 煮鍋 + ⌈混合機/2⌉)
  // 排除使用衍生流體（炙烈紅油、醋）的設備，杜絕重疊外採
  const cookersCount = processNodes.filter(p => p.machine === '煮鍋').reduce((sum, p) => sum + p.countRounded, 0);
  const fryersCount = processNodes.filter(p => {
    if (p.machine !== '油炸鍋') return false;
    const inter = intermediateRecipes.find(r => r.name === p.processName || p.processName.includes(r.name));
    return inter?.fluidType !== '炙烈紅油';
  }).reduce((sum, p) => sum + p.countRounded, 0);
  const waterMixers = processNodes.filter(p => p.machine === '混合機' && (p.processName.includes('麵包') || p.processName.includes('甘酒') || p.processName.includes('黃油'))).reduce((sum, p) => sum + p.countRounded, 0);
  const oilMixers = processNodes.filter(p => p.machine === '混合機' && p.processName.includes('玉米')).reduce((sum, p) => sum + p.countRounded, 0);

  const demandWater = Math.max(demandWaterRaw, cookersCount * 1.0 + Math.ceil(waterMixers / 2.0));
  const demandOil = Math.max(demandOilRaw, fryersCount * 1.0 + Math.ceil(oilMixers / 2.0));

  // In-situ transformation demand
  let transDemand = 0;
  let transFluidName = '衍生流體';
  let injProcessName = '原位轉化抽取';
  if (hasInjector) {
    const injProcess = processNodes.find(p => p.machine === '注入機' || p.processName.includes('注入'));
    transFluidName = injProcess ? injProcess.processName.replace('注入', '').replace('採收', '').trim() : '衍生流體';
    injProcessName = injProcess?.processName || '原位轉化抽取';
    
    // 動態結算所有直接或中間抽取此衍生流體（炙烈紅油、醋等）之設備流率總和
    let directDemand = 0;
    if (dishRecipe?.fluidType === transFluidName) {
      const cookerCount = processNodes.filter(p => p.machine === '自動廚師機').reduce((sum, p) => sum + p.countRounded, 0);
      directDemand += cookerCount * (dishRecipe.fluidRate || 1.0);
    }
    processNodes.forEach(p => {
      if (p.machine === '自動廚師機' || p.machine === '注入機') return;
      const inter = intermediateRecipes.find(r => r.name === p.processName || p.processName.includes(r.name));
      if (inter?.fluidType === transFluidName) {
        directDemand += p.countRounded * (inter.fluidRate || 1.0);
      }
    });

    transDemand = directDemand > 0 ? directDemand : 1.0;
  }

  // 全廠基建結算（泵機階梯、虛空閉環、電網 2:1 / 2:1:1）— 與多料理並聯共用 settlePlantInfrastructure
  const matterManipulatorsCount = processNodes
    .filter(p => p.machine === '物質操縱機')
    .reduce((sum, p) => sum + p.countRounded, 0);
  const mainEquipmentPower = processNodes.reduce((sum, p) => sum + p.power, 0);

  const infra = settlePlantInfrastructure({
    powerMode,
    waterDemand: demandWater,
    oilDemand: demandOil,
    processVoid: matterManipulatorsCount * 1.0, // 每台物質操縱機 1.0 fl/s
    transformations: hasInjector && transDemand > 0
      ? [{ name: injProcessName, fluid: transFluidName, demand: transDemand }]
      : [],
    mainPower: mainEquipmentPower,
    feederPower: baseFeeders.power,
    forceVoidFacility: baseVoid > 0
  });

  return assembleResult({
    dishName, targetRate, powerMode, processNodes, baseFeeders,
    sauces, transformations: infra.transformations, waterInfo: infra.water, oilInfo: infra.oil, voidInfo: infra.voidInfo,
    totalRegularPumps: infra.totalRegularPumps, totalOverclockPumps: infra.totalOverclockPumps,
    totalSludgeManipulators: infra.totalSludgeManipulators, totalPumpManipulatorPower: infra.totalPumpManipulatorPower,
    mainEquipmentPower,
    coalMinerPower: infra.coalMinerPower, totalLoad: infra.totalLoad, furnaces: infra.furnaces, coalMiners: infra.coalMiners,
    genSludgeManipulators: infra.genSludgeManipulators, coalRate: infra.coalRate,
    grossPower: infra.grossPower, netPower: infra.netPower, surplusPower: infra.surplusPower,
    items, recipes
  });
}

function normalizeProcessOrItemName(name: string): string {
  if (!name) return '';
  let cleaned = name.replace(/[\(（][^\)）]*[\)）]/g, '').trim();
  cleaned = cleaned.replace(ITEM_ACTION_PREFIX, '').trim();
  cleaned = cleaned.replace(/莎莎/g, '沙沙').replace(/波蘿/g, '菠蘿');
  if (cleaned === '史萊姆') return '綠色史萊姆';
  if (cleaned === '鷹身女妖肉') return '生鷹身女妖肉';
  if (cleaned === '麵團') return '麵包麵團';
  if (cleaned === '千層麵皮') return '生千層麵';
  return cleaned;
}

function resolveItem(cand: string, itemMap: Map<string, Item>): Item | null {
  if (!cand || cand === '無' || cand === '終端組裝') return null;
  if (itemMap.has(cand)) return itemMap.get(cand)!;
  const norm = normalizeProcessOrItemName(cand);
  if (itemMap.has(norm)) return itemMap.get(norm)!;
  if (itemMap.has('生' + norm)) return itemMap.get('生' + norm)!;
  if (itemMap.has('煮熟的' + norm)) return itemMap.get('煮熟的' + norm)!;
  return null;
}

function assembleResult(params: any): CalculationResult {
  const {
    dishName, targetRate, powerMode, processNodes, baseFeeders,
    sauces, transformations, waterInfo, oilInfo, voidInfo,
    totalRegularPumps, totalOverclockPumps, totalSludgeManipulators, totalPumpManipulatorPower,
    mainEquipmentPower, coalMinerPower, totalLoad, furnaces, coalMiners,
    genSludgeManipulators, coalRate, grossPower, netPower, surplusPower,
    items, recipes
  } = params;

  const totalMainMachines = processNodes.reduce((sum: number, p: ProcessNode) => sum + p.countRounded, 0);
  const mainEquipmentGoblins = processNodes.reduce((sum: number, p: ProcessNode) => sum + p.goblins, 0);

  // Total goblins matching Excel D13 = SUM(F17:F100) + D9 + D10 + D12 + B10
  const totalGoblins = mainEquipmentGoblins + baseFeeders.goblins + totalPumpManipulatorPower + furnaces * 1 + coalMiners * 1;

  // Biochemical Warnings
  const biochemicalWarnings: { item: string; type: string; detail: string }[] = [];
  const itemMap = new Map<string, Item>((items as Item[]).map((it: Item) => [it.name, it]));
  const intermediateRecipesList = dataService.getIntermediateRecipes();
  const interMap = new Map<string, IntermediateRecipe>(intermediateRecipesList.map((r: IntermediateRecipe) => [r.name, r]));
  const seenWarnings = new Set<string>();

  const candidateNames = new Set<string>();

  // 1. Candidate names from direct recipe inputs and fluid
  const recipe = (recipes as Recipe[])?.find(r => r.name === dishName);
  if (recipe) {
    if (recipe.inputs) {
      recipe.inputs.forEach(inp => {
        if (inp.name && inp.name !== '無') candidateNames.add(inp.name);
      });
    }
    if (recipe.fluidType && !['無', '水', '油', '虛空'].includes(recipe.fluidType)) {
      candidateNames.add(recipe.fluidType);
    }
  }

  // 2. Candidate names from process nodes & intermediate inputs
  processNodes.forEach((p: ProcessNode) => {
    if (p.processName && p.processName !== '終端組裝') {
      candidateNames.add(p.processName);
      const inter = interMap.get(p.processName);
      if (inter && inter.inputs) {
        inter.inputs.forEach(inp => {
          if (inp.name && inp.name !== '無') candidateNames.add(inp.name);
        });
      }
    }
  });

  // Resolve items
  const candidateItems: Item[] = [];
  candidateNames.forEach((cand: string) => {
    const it = resolveItem(cand, itemMap);
    if (!it) return;
    if (isTerrainOrPlant(it.name)) return;
    candidateItems.push(it);
  });

  // 檢測產線是否包含炙熱/熾熱屬性物品（排除中和與胃復慘）
  const isHotAttr = (attrStr: string) => {
    return (attrStr.includes('炙熱') || attrStr.includes('熾熱') || attrStr.includes('炽热')) && !attrStr.includes('中和');
  };

  const dishItem = itemMap.get(dishName);
  const hasHotItem = candidateItems.some(it => isHotAttr(it.attributes || '') && !it.name.includes('胃復慘')) ||
    Boolean(dishItem?.attributes && isHotAttr(dishItem.attributes)) ||
    Boolean(recipe?.notes && isHotAttr(recipe.notes));

  candidateItems.forEach((it: Item) => {
    const iname = it.name;
    const attrs = it.attributes || '';
    const isPerish = it.isPerishable;
    const spoilTime = it.spoilTime;
    const spoilProduct = it.spoilProduct;

    // 1. 氣味刺鼻 (Strictly data-driven: item must have '氣味刺鼻' in attributes)
    if (attrs.includes('氣味刺鼻')) {
      const key = `${iname}-氣味刺鼻`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '氣味刺鼻',
          detail: '散發強烈氣味，輸送需維持獨立封閉路徑，避免污染鄰近工序。'
        });
      }
    }

    // 2. 食物中毒 (Strictly data-driven: item must have '中毒' in attributes)
    if (attrs.includes('中毒')) {
      const key = `${iname}-食物中毒`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '食物中毒',
          detail: '生食具有中毒屬性，出餐前必須經由剝皮/加熱等熟化製程處理。'
        });
      }
    }

    // 3. 過敏原防護 (Strictly data-driven: item must have '過敏原' or '堅果' in attributes)
    if (attrs.includes('過敏原') || attrs.includes('堅果')) {
      const key = `${iname}-過敏原防護`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '過敏原防護',
          detail: '含有高致敏物質（如堅果類），必須設置專屬獨立專線，禁止與一般原料共用分流通道。'
        });
      }
    }

    // 4. 遇熱凝固 (Strictly data-driven: item must have '遇熱凝固' in attributes)
    // 物理法則：遇熱凝固物品不能碰到炙熱屬性物品；除非一道料理產線中同時存在遇熱凝固與炙熱物品，否則不顯示警示。
    // 有顯示需要時只需顯示遇熱凝固的警示（炙熱物品不影響其他物品，不需單獨警示）。
    if (attrs.includes('遇熱凝固') && hasHotItem) {
      const key = `${iname}-遇熱凝固`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '遇熱凝固',
          detail: '遇熱或辛辣物質會凝固堵管，因本料理產線包含炙熱/熾熱原料，傳送與儲存管線必須與熱源徹底實體隔離！'
        });
      }
    }

    // 5. 時效腐壞 (Strictly data-driven: item must have isPerishable && spoilTime)
    if (isPerish && spoilTime) {
      const key = `${iname}-時效腐壞`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '時效腐壞',
          detail: `在傳送帶上停留超過 ${spoilTime} 秒將變質為【${spoilProduct || '廢物'}】！注意機內暫存不跳計時。`
        });
      }
    }
  });

  // Sort warnings: 氣味刺鼻 -> 食物中毒 -> 過敏原防護 -> 遇熱凝固 -> 時效腐壞
  const orderMap: Record<string, number> = {
    氣味刺鼻: 1,
    食物中毒: 2,
    過敏原防護: 3,
    遇熱凝固: 4,
    時效腐壞: 5
  };
  biochemicalWarnings.sort((a, b) => (orderMap[a.type] || 99) - (orderMap[b.type] || 99) || a.item.localeCompare(b.item, 'zh-Hant'));

  return {
    dishName,
    targetRate,
    targetRateMin: Math.round(targetRate * 60),
    powerMode,
    feederStrategy: baseFeeders.strategy,
    processes: sortProcessesDownstreamToUpstream(processNodes),
    baseFeeders,
    fluids: {
      sauces,
      transformations,
      water: waterInfo,
      oil: oilInfo,
      voidFluid: voidInfo,
      totals: {
        regularPumps: totalRegularPumps,
        overclockPumps: totalOverclockPumps,
        sludgeManipulators: totalSludgeManipulators,
        totalPower: totalPumpManipulatorPower,
        totalGoblins: totalPumpManipulatorPower
      }
    },
    powerGrid: {
      mainEquipmentPower,
      pumpManipulatorPower: totalPumpManipulatorPower,
      baseFeederPower: baseFeeders.power,
      coalMinerPower,
      totalLoad,
      furnaces,
      coalMiners,
      generatorSludgeManipulators: genSludgeManipulators,
      coalRate,
      grossPower,
      netPower,
      surplusPower
    },
    goblinsBreakdown: {
      mainEquipment: mainEquipmentGoblins,
      baseFeeders: baseFeeders.goblins,
      pumpsAndManipulators: totalPumpManipulatorPower,
      furnaces,
      coalMiners,
      total: totalGoblins
    },
    totalMachineCount: totalMainMachines + baseFeeders.count,
    biochemicalWarnings
  };
}

export function isScorchingDish(
  dishName: string,
  items?: Item[],
  recipes?: Recipe[]
): boolean {
  if (!dishName || dishName === '胃復慘') return false;

  const currentItems = items && items.length > 0 ? items : dataService.getItems();
  const currentRecipes = recipes && recipes.length > 0 ? recipes : dataService.getRecipes();

  // 1. Strictly check the finished dish item itself (DO NOT check intermediate ingredients)
  const item = currentItems.find(i => i.name === dishName);
  if (item && item.attributes) {
    if (item.attributes.includes('熾熱') || item.attributes.includes('炙熱') || item.attributes.includes('炽热')) {
      return true;
    }
  }

  // 2. Check recipe notes if explicitly noted as scorching dish
  const recipe = currentRecipes.find(r => r.name === dishName);
  if (recipe && recipe.notes) {
    if (recipe.notes.includes('熾熱') || recipe.notes.includes('炙熱') || recipe.notes.includes('炽热')) {
      return true;
    }
  }

  return false;
}

