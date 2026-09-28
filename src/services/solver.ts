import { dataService } from './dataService';
import { CalculationResult, ProcessNode } from '../types';
import { parseFractionOrNumber, formatFractionOrDecimal, gcdArray } from '../utils/math';

export function calculateSingleDish(
  dishName: string,
  targetRate: number, // dishes/s (e.g. 0.2)
  powerMode: 'regular' | 'overclock' = 'regular'
): CalculationResult | null {
  const calcDb = dataService.getCalculatorDb();
  const machines = dataService.getMachines();
  const items = dataService.getItems();
  const recipes = dataService.getRecipes();

  // 1. Get processes for this dish
  const processesRaw = calcDb.processes.filter(p => p.dish === dishName);
  if (processesRaw.length === 0) {
    // Check if dish exists in recipes
    const r = recipes.find(rec => rec.name === dishName);
    if (!r) return null;
  }

  // Map machine lookup
  const machineMap = new Map(machines.map(m => [m.name, m]));

  const processNodes: ProcessNode[] = [];

  for (const p of processesRaw) {
    const mach = machineMap.get(p.machine);
    const powerPerUnit = mach ? mach.power : p.power;
    const goblinsPerUnit = mach ? mach.goblins : p.goblins;
    const baseRateNum = parseFractionOrNumber(p.baseRate);

    // Demand rate in terms of machines
    const demandRate = baseRateNum > 0 ? targetRate / baseRateNum : 0;
    const countExact = demandRate;
    const countRounded = Math.ceil(demandRate);

    // Check warnings for this process
    const warnings: string[] = [];
    if (p.machine === '混合機') {
      warnings.push('流體消耗特殊值：固定 0.5 fl/s (4秒2fl)');
    }
    if (p.machine === '攪拌機') {
      warnings.push('實體管網佈線：多台嚴禁合流為單管，必須鋪設 1:1 獨立專線');
    }
    if (p.machine === '注入機') {
      warnings.push('環境原位轉化：於環境池中轉化，需另配專屬抽取泵機');
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
      integerRatio: 1, // will update with GCD
      fluidRate: mach?.fluidRate || 0,
      fluidType: mach?.fluidType || '無',
      warnings
    });
  }

  // 2. Integer Ratios (GCD)
  const counts = processNodes.map(p => p.countRounded);
  const commonGcd = gcdArray(counts);
  processNodes.forEach(p => {
    p.integerRatio = commonGcd > 0 ? p.countRounded / commonGcd : p.countRounded;
  });

  // 3. Fluids Calculation
  // Sauces from blenders/mixers: 1.0 fl/s per dedicated pipe
  const sauces: { name: string; rate: number; dedicatedPipes: number }[] = [];
  processNodes.filter(p => p.machine === '攪拌機').forEach(p => {
    sauces.push({
      name: p.processName,
      rate: p.countRounded * 1.0,
      dedicatedPipes: p.countRounded
    });
  });

  // In-situ transformations (e.g. 抽取炙烈紅油, 抽取醋)
  const inSituTransformations: { name: string; fluid: string; pumpsNeeded: number; rate: number }[] = [];
  processNodes.filter(p => p.processName.startsWith('抽取')).forEach(p => {
    inSituTransformations.push({
      name: p.processName,
      fluid: p.processName.replace('抽取', '').trim(),
      pumpsNeeded: p.countRounded,
      rate: p.countRounded * 2.0
    });
  });

  // External fluids from materials DB (water, oil, void)
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

  // Rate factor: base amounts in BOM are based on 0.2 dishes/s
  const rateFactor = targetRate / 0.2;
  const demandWater = Number((baseWater * rateFactor).toFixed(2));
  const demandOil = Number((baseOil * rateFactor).toFixed(2));
  let demandVoid = Number((baseVoid * rateFactor).toFixed(2));

  // Determine if factory uses void
  const factoryHasVoid = demandVoid > 0;

  // Water pump sizing:
  // Threshold: if factory has void, overclock threshold is > 2.0 fl/s; else > 6.0 fl/s
  const waterThreshold = factoryHasVoid ? 2.0 : 6.0;
  let waterRegularPumps = 0;
  let waterOverclockPumps = 0;
  if (demandWater > 0) {
    if (demandWater <= waterThreshold) {
      waterRegularPumps = Math.ceil(demandWater / 2.0);
    } else {
      waterOverclockPumps = Math.ceil(demandWater / 8.0);
    }
  }

  // Oil pump sizing:
  const oilThreshold = factoryHasVoid ? 2.0 : 6.0;
  let oilRegularPumps = 0;
  let oilOverclockPumps = 0;
  if (demandOil > 0) {
    if (demandOil <= oilThreshold) {
      oilRegularPumps = Math.ceil(demandOil / 2.0);
    } else {
      oilOverclockPumps = Math.ceil(demandOil / 8.0);
    }
  }

  // Void pump sizing (Gross 8 fl/s, net 7 fl/s per overclock pump; 2 fl/s per regular pump)
  // Each overclock pump in the plant (water, oil, void) requires 1 sludge manipulator = 1.0 fl/s void self-loss
  const nonVoidOverclockPumps = waterOverclockPumps + oilOverclockPumps;
  demandVoid += nonVoidOverclockPumps * 1.0;

  let voidRegularPumps = 0;
  let voidOverclockPumps = 0;
  if (demandVoid > 0) {
    if (demandVoid <= 2.0) {
      voidRegularPumps = Math.ceil(demandVoid / 2.0);
    } else {
      // Net 7 fl/s per overclock void pump
      voidOverclockPumps = Math.ceil(demandVoid / 7.0);
      demandVoid += voidOverclockPumps * 1.0; // self sludge manipulator
    }
  }

  const totalSludgeLoss = (waterOverclockPumps + oilOverclockPumps + voidOverclockPumps) * 1.0;
  const pumpPower = (waterRegularPumps + oilRegularPumps + voidRegularPumps) * 1.0 +
                    (waterOverclockPumps + oilOverclockPumps + voidOverclockPumps) * 2.0;

  // 4. Power & Energy Supply Balance
  const baseProcessesPower = processNodes.reduce((acc, p) => acc + p.power, 0);
  const totalPowerLoadBeforeGenerators = baseProcessesPower + pumpPower;

  let furnaces = 0;
  let coalMiners = 0;
  let sludgeManipulators = 0;
  let coalRate = 0;
  let grossFV = 0;
  let netFV = 0;
  let surplusFV = 0;

  if (powerMode === 'regular') {
    // 4 FV/s mode: Furnace gives 4 FV/s, uses 0.1 coal/s. Coal miner gives 0.2 coal/s, uses 1 FV/s.
    // Net output = 3.5 FV/s per furnace.
    furnaces = Math.ceil(totalPowerLoadBeforeGenerators / 3.5);
    coalMiners = Math.ceil(furnaces / 2);
    grossFV = furnaces * 4;
    netFV = grossFV - coalMiners * 1;
    surplusFV = Number((netFV - totalPowerLoadBeforeGenerators).toFixed(2));
    coalRate = Number((furnaces * 0.1).toFixed(2));
  } else {
    // 16 FV/s overclock mode (2:1:1 module: 2 furnaces, 1 coal miner, 1 sludge manipulator)
    // 2 furnaces = 32 FV/s - 1 miner - 1 manipulator = 30 FV/s net -> 15.0 FV/s per furnace.
    furnaces = Math.max(1, Math.ceil(totalPowerLoadBeforeGenerators / 15.0));
    coalMiners = Math.ceil(furnaces / 2);
    sludgeManipulators = Math.ceil(furnaces / 2);
    grossFV = furnaces * 16;
    netFV = grossFV - (coalMiners * 1 + sludgeManipulators * 1);
    surplusFV = Number((netFV - totalPowerLoadBeforeGenerators).toFixed(2));
    coalRate = Number((furnaces * 0.1).toFixed(2));
  }

  // 5. Total Goblins & Equipment
  const totalMachineCount = processNodes.reduce((acc, p) => acc + p.countRounded, 0);
  const totalGoblins = processNodes.reduce((acc, p) => acc + p.goblins, 0) +
                       waterRegularPumps * 1 + waterOverclockPumps * 2 +
                       oilRegularPumps * 1 + oilOverclockPumps * 2 +
                       voidRegularPumps * 1 + voidOverclockPumps * 2 +
                       furnaces * 1 + coalMiners * 1 + sludgeManipulators * 1;

  // 6. Biochemical & Physical Warnings
  const biochemicalWarnings: { item: string; type: string; detail: string }[] = [];
  const itemMap = new Map(items.map(it => [it.name, it]));

  // Check ingredients
  processNodes.forEach(p => {
    const it = itemMap.get(p.processName) || itemMap.get(p.processName.replace('採集', '').replace('採掘', '').replace('收割', '').trim());
    if (it) {
      if (it.attributes?.includes('遇熱凝固')) {
        biochemicalWarnings.push({
          item: it.name,
          type: '遇熱凝固',
          detail: '乳製品遇熱或辛辣物質會凝固堵管，傳送與儲存管線必須與熱源徹底實體隔離。'
        });
      }
      if (it.attributes?.includes('過敏原')) {
        biochemicalWarnings.push({
          item: it.name,
          type: '過敏原防護',
          detail: '含有高致敏物質（如豆肉蔻），必須設置專屬獨立專線，禁止與一般原料共用分流。'
        });
      }
      if (it.attributes?.includes('氣味刺鼻')) {
        biochemicalWarnings.push({
          item: it.name,
          type: '氣味刺鼻',
          detail: '散發強烈氣味，輸送需維持獨立封閉路徑，避免污染鄰近工序。'
        });
      }
      if (it.attributes?.includes('中毒')) {
        biochemicalWarnings.push({
          item: it.name,
          type: '食物中毒',
          detail: '生食具有中毒屬性，出餐前必須經由剝皮/加熱等熟化製程處理。'
        });
      }
      if (it.isPerishable && it.spoilTime) {
        biochemicalWarnings.push({
          item: it.name,
          type: '時效腐壞',
          detail: `在傳送帶上停留超過 ${it.spoilTime} 秒將變質為【${it.spoilProduct || '廢物'}】！注意機內暫存不跳計時。`
        });
      }
    }
  });

  return {
    dishName,
    targetRate,
    targetRateMin: Math.round(targetRate * 60),
    powerMode,
    processes: processNodes,
    totalMachineCount,
    totalPower: totalPowerLoadBeforeGenerators,
    totalGoblins,
    fluids: {
      sauces,
      inSituTransformations,
      water: {
        demand: demandWater,
        regularPumps: waterRegularPumps,
        overclockPumps: waterOverclockPumps,
        pumpPower: waterRegularPumps * 1 + waterOverclockPumps * 2
      },
      oil: {
        demand: demandOil,
        regularPumps: oilRegularPumps,
        overclockPumps: oilOverclockPumps,
        pumpPower: oilRegularPumps * 1 + oilOverclockPumps * 2
      },
      voidFluid: {
        demand: Number(demandVoid.toFixed(2)),
        regularPumps: voidRegularPumps,
        overclockPumps: voidOverclockPumps,
        pumpPower: voidRegularPumps * 1 + voidOverclockPumps * 2,
        sludgeSelfLoss: totalSludgeLoss
      }
    },
    powerSupply: {
      furnaces,
      coalMiners,
      sludgeManipulators,
      coalRate,
      grossFV,
      netFV,
      surplusFV
    },
    biochemicalWarnings
  };
}
