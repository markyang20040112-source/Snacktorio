import { dataService } from './dataService';
import { CalculationResult, ProcessNode, FluidTierInfo, Item, FeederStrategy, Recipe, IntermediateRecipe } from '../types';
import { parseFractionOrNumber, formatFractionOrDecimal, gcdArray } from '../utils/math';

/**
 * Autonomous pump sizing ladder matching Excel formulas
 * Capacity: Overclock 8 fl/s (requires 1 sludge manipulator), Regular 2 fl/s (0 sludge)
 * Threshold: if plant has void, threshold > 2.0 fl/s; else > 6.0 fl/s
 */
export function sizeAutonomousPump(demand: number, hasVoid: boolean): FluidTierInfo {
  if (demand <= 0) {
    return { demand: 0, regularPumps: 0, overclockPumps: 0, sludgeManipulators: 0, pumpPower: 0 };
  }

  const threshold = hasVoid ? 2.0 : 6.0;
  const remainder = demand % 8;
  const ocPumps = Math.floor(demand / 8) + (remainder > threshold ? 1 : 0);
  const regDemandRemainder = remainder > threshold ? 0 : remainder;
  const regPumps = Math.ceil(regDemandRemainder / 2.0);
  const sludgeManipulators = ocPumps; // 1 sludge manipulator per overclock pump
  const pumpPower = (ocPumps + regPumps + sludgeManipulators) * 1.0;

  return {
    demand: Number(demand.toFixed(2)),
    regularPumps: regPumps,
    overclockPumps: ocPumps,
    sludgeManipulators,
    pumpPower
  };
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

const ACTION_VERBS = /^(採收|採掘|開採|採集|重構|物質操縱|研磨|混和|混合|水煮|燉煮|清蒸|擠出|油炸|油煎|烘烤|烘焙|注入|發酵|切片|壓榨|離心|煎烤|熬煮|烹煮|絞碎|剝皮|攪拌|萃取|提煉|粉碎|打碎|調配|製造|加工)/;

function normalizeMatName(str: string): string {
  return str.replace(/麵糰/g, '麵團');
}

function isRawItem(name: string): boolean {
  return /^(生|生的|生鮮|生鮮的)/.test(name) && !/^(生產|生成)/.test(name);
}

function getBaseItemName(str: string): string {
  return normalizeMatName(str)
    .replace(/^(煮熟的|新鮮的|烘烤的|油炸的|生鮮的|熟的|生的|生|熟)/, '')
    .trim();
}

function matchMaterial(prodItem: { name: string; isFluid: boolean }, reqItem: { name: string; isFluid: boolean }): boolean {
  if (prodItem.isFluid !== reqItem.isFluid) return false;
  const pNorm = normalizeMatName(prodItem.name);
  const rNorm = normalizeMatName(reqItem.name);
  if (pNorm === rNorm) return true;

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

function getProcessOutputItem(
  p: ProcessNode,
  dishName: string,
  intermediateRecipes: IntermediateRecipe[],
  allItems: Set<string>
): { name: string; isFluid: boolean } {
  if (p.machine === '自動廚師機') return { name: dishName, isFluid: false };
  if (p.processName.includes('底料作物採集') || p.processName.includes('底料專供')) {
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

  const stripped = p.processName.replace(ACTION_VERBS, '').trim();

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

  const inter = intermediateRecipes.find(r => (r.name === stripped || r.name === p.processName) && r.machine === p.machine);
  if (inter) return { name: inter.name, isFluid: false };

  return { name: stripped, isFluid: false };
}

function getProcessInputItems(
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
  const processesRaw = calcDb.processes.filter(p => p.dish === dishName);
  if (processesRaw.length === 0) {
    const r = recipes.find(rec => rec.name === dishName);
    if (!r) return null;
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
      } else if (curr.node.processName.includes('底料作物採集') || curr.node.processName.includes('底料專供')) {
        curr.node.topology = '直供【物質操縱機】(重構底料)';
        curr.node.downstreamTargets = [{
          processName: '重構底料',
          machine: '物質操縱機',
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
      if (c.isFluid) {
        curr.node.topology = `專線直供【${c.target.processName}】(${c.target.machine}) (1.0 fl/s)`;
        curr.node.downstreamTargets = [{
          processName: c.target.processName,
          machine: c.target.machine,
          ratio: 1,
          isFluid: true,
          note: '1.0 fl/s'
        }];
      } else {
        curr.node.topology = `連至【${c.target.processName}】(${c.target.machine})`;
        curr.node.downstreamTargets = [{
          processName: c.target.processName,
          machine: c.target.machine,
          ratio: 1
        }];
      }
    } else {
      const reqCounts = consumers.map(c => c.reqCount);
      const g = gcdArray(reqCounts);
      const ratioStr = reqCounts.map(c => c / g).join(' : ');
      const desc = consumers.length === 2
        ? `【${consumers[0].target.processName}】(${consumers[0].target.machine}) 與【${consumers[1].target.processName}】(${consumers[1].target.machine})`
        : consumers.slice(0, -1).map(c => `【${c.target.processName}】(${c.target.machine})`).join('、') + ` 與【${consumers[consumers.length - 1].target.processName}】(${consumers[consumers.length - 1].target.machine})`;
      curr.node.topology = `分流至${desc} 配比 ${ratioStr}`;
      curr.node.downstreamTargets = consumers.map((c, idx) => ({
        processName: c.target.processName,
        machine: c.target.machine,
        ratio: reqCounts[idx] / (g > 0 ? g : 1),
        isFluid: c.isFluid
      }));
    }
  });

  // 3. 重構底料收割機 (Matter Manipulator Base Feeder Harvesters)
  const matterManipulatorsCount = processNodes
    .filter(p => p.machine === '物質操縱機')
    .reduce((sum, p) => sum + p.countRounded, 0);

  let offsetCount = 0;
  let offsetSource = '';

  if (feederStrategy === 'recycle' && matterManipulatorsCount > 0) {
    // 檢查產線中是否有具備過剩產能的固體中間加工工序 (排除終端組裝、純流體與發電機)
    const nonDonorMachines = ['自動廚師機', '物質操縱機', '攪拌機', '注入機', '虛空熔爐', '虛空泵機'];
    const candidateNodes = processNodes.filter(p => 
      !nonDonorMachines.includes(p.machine) &&
      p.countRounded > p.demandRate
    );

    let totalOffsetAvailable = 0;
    const sources: string[] = [];

    candidateNodes.forEach(p => {
      const baseRateNum = parseFractionOrNumber(p.baseRate);
      const surplusRate = (p.countRounded - p.demandRate) * (baseRateNum > 0 ? baseRateNum : 0.2);
      // 每 0.2/s 過剩流率等同於 1 台收割機之產能
      if (surplusRate >= 0.15) {
        const potential = Math.floor((surplusRate + 0.05) / 0.2);
        if (potential > 0) {
          totalOffsetAvailable += potential;
          sources.push(`【${p.processName}】過剩 ${surplusRate.toFixed(2)}/s`);
        }
      }
    });

    if (totalOffsetAvailable > 0) {
      const manipulators = processNodes.filter(p => p.machine === '物質操縱機');

      // 動態分析：判斷是否有候選過剩工序的原料鏈向上依賴本料理中的某台物質操縱機產物 (Chicken-and-Egg 死鎖防護)
      // 若依賴某台物質操縱機，該操縱機即為「起始啟動機 (Progenitor)」，必須保留其專屬底料收割機啟動鏈條
      const progenitorManipulators = manipulators.filter(m => {
        const mProduct = m.processName.replace('重構', '').replace('物質操縱', '').trim();
        return candidateNodes.some(c => {
          const rec = intermediateRecipes.find(r => 
            r.name === c.processName || c.processName.includes(r.name) || r.name.includes(c.processName)
          );
          return rec ? rec.inputs.some(inp => inp.name.includes(mProduct) || mProduct.includes(inp.name)) : false;
        });
      });

      const hasManipulatorChain = progenitorManipulators.length > 0;
      const rootManipulator = progenitorManipulators[0] || manipulators[0];
      const maxAllowed = hasManipulatorChain ? Math.max(0, matterManipulatorsCount - 1) : matterManipulatorsCount;
      offsetCount = Math.min(totalOffsetAvailable, maxAllowed);

      if (offsetCount > 0) {
        // 標記提供過剩產能的供給設備 (Donor) 與接收底料的操縱機 (Recipient)
        const donorNodes = candidateNodes.filter(p => {
          const baseRateNum = parseFractionOrNumber(p.baseRate);
          const surplusRate = (p.countRounded - p.demandRate) * (baseRateNum > 0 ? baseRateNum : 0.2);
          return surplusRate >= 0.15;
        });

        // 接收端優先分配給非起始操縱機 (若無起始依賴，則可分配給任意操縱機)
        const recipientManipulators = hasManipulatorChain
          ? manipulators.filter(m => m !== rootManipulator).slice(0, offsetCount)
          : manipulators.slice(0, offsetCount);

        // 依據各供給設備 (Donor) 之可用過剩容量，輪流 (Round-robin) 1:1 分配接收端操縱機 (Recipient)
        const donorSlots = donorNodes.map(d => {
          const baseRateNum = parseFractionOrNumber(d.baseRate);
          const surplusRate = (d.countRounded - d.demandRate) * (baseRateNum > 0 ? baseRateNum : 0.2);
          return {
            donor: d,
            available: Math.floor((surplusRate + 0.05) / 0.2),
            recipients: [] as ProcessNode[]
          };
        });

        let rIndex = 0;
        while (rIndex < recipientManipulators.length) {
          let assignedInRound = false;
          for (const ds of donorSlots) {
            if (rIndex >= recipientManipulators.length) break;
            if (ds.available > 0) {
              ds.recipients.push(recipientManipulators[rIndex]);
              ds.available--;
              rIndex++;
              assignedInRound = true;
            }
          }
          if (!assignedInRound) break;
        }

        const actualSources: string[] = [];
        donorSlots.forEach(ds => {
          const d = ds.donor;
          if (ds.recipients.length > 0) {
            d.feederRole = 'donor';
            const recNames = ds.recipients.map(r => `【${r.processName}】`).join('、');
            d.feederNote = `產能過剩，分流直供${recNames}作為底料`;
            actualSources.push(`【${d.processName}】過剩直供${recNames}`);

            if (!d.downstreamTargets) d.downstreamTargets = [];
            ds.recipients.forEach(r => {
              d.downstreamTargets!.push({
                processName: r.processName,
                machine: '物質操縱機',
                ratio: 1,
                isByproduct: true,
                note: '副產物折抵'
              });
              r.feederRole = 'recipient';
              r.feederNote = `底料由【${d.processName}】過剩產能直供 (省 1 底料機)`;
            });
          }
        });

        if (actualSources.length > 0) {
          offsetSource = `由${actualSources.join('、')} (折抵 ${offsetCount} 台)`;
        }
      }
    }
  }

  const finalFeederCount = Math.max(0, matterManipulatorsCount - offsetCount);
  const baseFeeders = {
    strategy: feederStrategy,
    grossRequired: matterManipulatorsCount,
    offsetCount,
    count: finalFeederCount,
    offsetSource: offsetSource || undefined,
    power: finalFeederCount * 1.0, // 1 FV/s per feeder
    goblins: finalFeederCount * 1.0 // 1 goblin per feeder
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
  const transformations: (FluidTierInfo & { name: string; fluid: string })[] = [];

  // (C) Quadrant 4: 外採流體 (水、油、虛空)
  const materialsRaw = calcDb.materials.filter(m => m.dish === dishName);
  let baseWater = 0;
  let baseOil = 0;
  let baseVoid = 0;

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

  const rateFactor = targetRate / 0.2;
  const demandWaterRaw = baseWater * rateFactor;
  const demandOilRaw = baseOil * rateFactor;

  // Dual-Tier Node Engine fallback validation matching Excel N9 and N10:
  // Water: MAX(BOM, 煮鍋 + ⌈混合機/2⌉)
  const cookersCount = processNodes.filter(p => p.machine === '煮鍋').reduce((sum, p) => sum + p.countRounded, 0);
  const fryersCount = processNodes.filter(p => p.machine === '油炸鍋').reduce((sum, p) => sum + p.countRounded, 0);
  const waterMixers = processNodes.filter(p => p.machine === '混合機' && (p.processName.includes('麵包') || p.processName.includes('甘酒') || p.processName.includes('黃油'))).reduce((sum, p) => sum + p.countRounded, 0);
  const oilMixers = processNodes.filter(p => p.machine === '混合機' && (p.processName.includes('玉米') || p.processName.includes('沙沙'))).reduce((sum, p) => sum + p.countRounded, 0);

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
    
    // In Excel: if 炙烈紅油: cookers * 1.0 + mixers * 0.5; else 1.0 fl/s
    if (transFluidName.includes('紅油')) {
      const cookerCount = processNodes.filter(p => p.machine === '自動廚師機').reduce((sum, p) => sum + p.countRounded, 0);
      const mixerCount = processNodes.filter(p => p.machine === '混合機').reduce((sum, p) => sum + p.countRounded, 0);
      transDemand = cookerCount * 1.0 + mixerCount * 0.5;
    } else {
      transDemand = 1.0;
    }
  }

  // Autonomous Overclocking Threshold Rule:
  // 全廠有任何虛空設施（重構機、食譜耗虛空、超頻發電、或任一流體泵超頻需量 > 6）時，門檻即為 > 2 fl/s，否則為 > 6 fl/s。
  const hasVoidFacility = baseVoid > 0 ||
                          matterManipulatorsCount > 0 ||
                          powerMode === 'overclock' ||
                          demandWater > 6.0 ||
                          demandOil > 6.0 ||
                          transDemand > 6.0;

  // Autonomous Sizing for Water, Oil, and Transformation Extraction Pumps
  const waterInfo = sizeAutonomousPump(demandWater, hasVoidFacility);
  const oilInfo = sizeAutonomousPump(demandOil, hasVoidFacility);

  if (hasInjector && transDemand > 0) {
    const transPump = sizeAutonomousPump(transDemand, hasVoidFacility);
    transformations.push({
      name: injProcessName,
      fluid: transFluidName,
      ...transPump
    });
  }

  // 5. Total Void Demand & Sizing
  // Void consists of:
  // 1) Process Matter Manipulators: 1.0 fl/s per machine
  const processVoid = matterManipulatorsCount * 1.0;
  // 2) Overclock Pump Sludge Manipulators: 1.0 fl/s per overclock pump (Water, Oil, Transformation)
  const transSludge = transformations.reduce((sum, t) => sum + t.sludgeManipulators, 0);
  const pumpSludgeVoid = (waterInfo.sludgeManipulators + oilInfo.sludgeManipulators + transSludge) * 1.0;

  // 3) Generator Overclock Sludge Manipulators:
  // Preliminary estimate of total load to estimate furnaces
  const mainEquipmentPower = processNodes.reduce((sum, p) => sum + p.power, 0);
  const prelimPumpPower = waterInfo.pumpPower + oilInfo.pumpPower + transformations.reduce((sum, t) => sum + t.pumpPower, 0);
  const prelimBaseLoad = mainEquipmentPower + prelimPumpPower + baseFeeders.power;

  let prelimFurnaces = 1;
  let generatorSludgeVoid = 0;
  let genSludgeManipulators = 0;

  if (powerMode === 'overclock') {
    prelimFurnaces = Math.max(1, Math.ceil(prelimBaseLoad / 14.0));
    genSludgeManipulators = Math.ceil(prelimFurnaces / 2.0);
    generatorSludgeVoid = genSludgeManipulators * 1.0;
  }

  const totalVoidDemand = Number((processVoid + pumpSludgeVoid + generatorSludgeVoid).toFixed(2));

  // Autonomous Void Pump sizing (Gross 8 fl/s, Net 7 fl/s per overclock pump; 2 fl/s per regular pump)
  let voidOverclockPumps = 0;
  let voidRegularPumps = 0;
  if (totalVoidDemand > 0) {
    const rem7 = totalVoidDemand % 7;
    voidOverclockPumps = Math.floor(totalVoidDemand / 7) + (rem7 > 2.0 ? 1 : 0);
    voidRegularPumps = (rem7 > 0 && rem7 <= 2.0) ? 1 : 0;
  }
  const voidSludgeManipulators = voidOverclockPumps;
  const voidPumpPower = (voidOverclockPumps + voidRegularPumps + voidSludgeManipulators) * 1.0;

  const voidInfo: FluidTierInfo & { breakdown: { processVoid: number; generatorSludgeVoid: number; pumpSludgeVoid: number } } = {
    demand: totalVoidDemand,
    regularPumps: voidRegularPumps,
    overclockPumps: voidOverclockPumps,
    sludgeManipulators: voidSludgeManipulators,
    pumpPower: voidPumpPower,
    breakdown: {
      processVoid,
      generatorSludgeVoid,
      pumpSludgeVoid
    }
  };

  // Total Pumps and Manipulators across entire plant (matching Excel Row 12 O12, P12, Q12 and Q13)
  const totalRegularPumps = waterInfo.regularPumps + oilInfo.regularPumps + voidInfo.regularPumps +
                           transformations.reduce((sum, t) => sum + t.regularPumps, 0);

  const totalOverclockPumps = waterInfo.overclockPumps + oilInfo.overclockPumps + voidInfo.overclockPumps +
                             transformations.reduce((sum, t) => sum + t.overclockPumps, 0);

  const totalSludgeManipulators = waterInfo.sludgeManipulators + oilInfo.sludgeManipulators + voidInfo.sludgeManipulators +
                                 transformations.reduce((sum, t) => sum + t.sludgeManipulators, 0) +
                                 genSludgeManipulators;

  const totalPumpManipulatorPower = (totalRegularPumps + totalOverclockPumps + totalSludgeManipulators) * 1.0;

  // 6. Power Grid Calculation (Matching Excel Row 9..13 B9, B10, B11, B12 -> B13)
  // B9: mainEquipmentPower
  // B10: pumpManipulatorPower (= Q13)
  // B11: baseFeederPower (= D9 * 1)
  // B12: coalMinerPower (= D12 * 1)
  const baseForFurnace = mainEquipmentPower + totalPumpManipulatorPower + baseFeeders.power;

  let furnaces = 0;
  let coalMiners = 0;
  let coalRate = 0;
  let grossPower = 0;
  let netPower = 0;
  let surplusPower = 0;

  if (powerMode === 'regular') {
    // 4 FV/s regular mode: net 3.5 FV/s per furnace
    furnaces = Math.max(1, Math.ceil(baseForFurnace / 3.5));
    coalMiners = Math.ceil(furnaces / 2.0);
    grossPower = furnaces * 4.0;
    coalRate = Number((furnaces * 0.1).toFixed(2));
    const coalMinerPower = coalMiners * 1.0;
    const totalLoad = baseForFurnace + coalMinerPower;
    netPower = grossPower - coalMinerPower;
    surplusPower = Number((netPower - totalLoad).toFixed(2));

    return assembleResult({
      dishName, targetRate, powerMode, processNodes, baseFeeders,
      sauces, transformations, waterInfo, oilInfo, voidInfo,
      totalRegularPumps, totalOverclockPumps, totalSludgeManipulators, totalPumpManipulatorPower,
      mainEquipmentPower, coalMinerPower, totalLoad, furnaces, coalMiners,
      genSludgeManipulators: 0, coalRate, grossPower, netPower, surplusPower,
      items, recipes, intermediateRecipes
    });
  } else {
    // 16 FV/s overclock mode (2:1:1 module: 2 furnaces, 1 miner, 1 manipulator)
    // Excel formula: ROUNDUP((B9 + B10 + B11) / 14, 0)
    furnaces = Math.max(1, Math.ceil(baseForFurnace / 14.0));
    coalMiners = Math.ceil(furnaces / 2.0);
    genSludgeManipulators = Math.ceil(furnaces / 2.0);
    grossPower = furnaces * 16.0;
    coalRate = Number((furnaces * 0.1).toFixed(2));
    const coalMinerPower = coalMiners * 1.0;
    const totalLoad = baseForFurnace + coalMinerPower;
    netPower = grossPower - (coalMinerPower + genSludgeManipulators * 1.0);
    surplusPower = Number((netPower - totalLoad).toFixed(2));

    return assembleResult({
      dishName, targetRate, powerMode, processNodes, baseFeeders,
      sauces, transformations, waterInfo, oilInfo, voidInfo,
      totalRegularPumps, totalOverclockPumps, totalSludgeManipulators, totalPumpManipulatorPower,
      mainEquipmentPower, coalMinerPower, totalLoad, furnaces, coalMiners,
      genSludgeManipulators, coalRate, grossPower, netPower, surplusPower,
      items, recipes, intermediateRecipes
    });
  }
}

function normalizeProcessOrItemName(name: string): string {
  if (!name) return '';
  let cleaned = name.replace(/[\(（][^\)）]*[\)）]/g, '').trim();
  cleaned = cleaned.replace(/^(採收|開採|採集|製作|調配|水煮|油炸|重構|擠出|研磨|混合|混和|烘焙|烘烤|攪拌|剝皮|注入|絞碎|發酵|炸|煮|採)/, '').trim();
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

function isTerrainOrPlant(name: string): boolean {
  if (!name) return true;
  return name.includes('(礦石方塊)') || name.includes('(香料方塊)') || name.endsWith('植株') || name.endsWith('塊莖');
}

function assembleResult(params: any): CalculationResult {
  const {
    dishName, targetRate, powerMode, processNodes, baseFeeders,
    sauces, transformations, waterInfo, oilInfo, voidInfo,
    totalRegularPumps, totalOverclockPumps, totalSludgeManipulators, totalPumpManipulatorPower,
    mainEquipmentPower, coalMinerPower, totalLoad, furnaces, coalMiners,
    genSludgeManipulators, coalRate, grossPower, netPower, surplusPower,
    items, recipes, intermediateRecipes
  } = params;

  const totalMainMachines = processNodes.reduce((sum: number, p: ProcessNode) => sum + p.countRounded, 0);
  const mainEquipmentGoblins = processNodes.reduce((sum: number, p: ProcessNode) => sum + p.goblins, 0);

  // Total goblins matching Excel D13 = SUM(F17:F100) + D9 + D10 + D12 + B10
  const totalGoblins = mainEquipmentGoblins + baseFeeders.goblins + totalPumpManipulatorPower + furnaces * 1 + coalMiners * 1;

  // Biochemical Warnings
  const biochemicalWarnings: { item: string; type: string; detail: string }[] = [];
  const itemMap = new Map<string, Item>((items as Item[]).map((it: Item) => [it.name, it]));
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

  // 2. Candidate names from process nodes
  processNodes.forEach((p: ProcessNode) => {
    if (p.processName && p.processName !== '終端組裝') {
      candidateNames.add(p.processName);
    }
  });

  candidateNames.forEach((cand: string) => {
    const it = resolveItem(cand, itemMap);
    if (!it) return;
    const iname = it.name;
    if (isTerrainOrPlant(iname)) return;

    const attrs = it.attributes || '';
    const isPerish = it.isPerishable;
    const spoilTime = it.spoilTime;
    const spoilProduct = it.spoilProduct;

    // 1. 氣味刺鼻
    if (
      attrs.includes('氣味刺鼻') ||
      ['小蒜', '刺菠蘿', '油荳蔻', '老爹脆辣辣椒', 'E127', '炸小蒜', '虛空汙泥', '驚嚇醃薑'].includes(iname)
    ) {
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

    // 2. 食物中毒
    if (
      attrs.includes('中毒') ||
      ['致命傘菇', '哥布林肉排', '鷹身女妖翅膀', '生鷹身女妖肉', '毒蘑菇·肉'].includes(iname)
    ) {
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

    // 3. 過敏原防護
    if (
      attrs.includes('過敏原') ||
      attrs.includes('含有堅果') ||
      attrs.includes('堅果') ||
      ['豆肉蔻', '松子'].includes(iname)
    ) {
      const key = `${iname}-過敏原防護`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '過敏原防護',
          detail: '含有高致敏物質（如豆肉蔻、松子），必須設置專屬獨立專線，禁止與一般原料共用分流通道。'
        });
      }
    }

    // 4. 遇熱凝固
    if (
      attrs.includes('遇熱凝固') ||
      ['蟑螂奶', '蟑螂奶油', '軟質奶酪', '中等熟成奶酪', '硬質奶酪', '蟑螂酸奶', '藍紋奶酪'].includes(iname) ||
      iname.includes('奶酪') ||
      iname.includes('蟑螂奶')
    ) {
      const key = `${iname}-遇熱凝固`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        biochemicalWarnings.push({
          item: iname,
          type: '遇熱凝固',
          detail: '乳製品遇熱或辛辣物質會凝固堵管，傳送與儲存管線必須與熱源徹底實體隔離。'
        });
      }
    }

    // 5. 時效腐壞
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
  biochemicalWarnings.sort((a, b) => (orderMap[a.type] || 99) - (orderMap[b.type] || 99) || a.item.localeCompare(b.item));

  return {
    dishName,
    targetRate,
    targetRateMin: Math.round(targetRate * 60),
    powerMode,
    feederStrategy: baseFeeders.strategy,
    processes: processNodes,
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
