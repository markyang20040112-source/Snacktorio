import { dataService } from './dataService';
import { CalculationResult, ProcessNode, FluidTierInfo, Item } from '../types';
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

  // 2. Integer Ratios (GCD) and Topology Advice
  const counts = processNodes.map(p => p.countRounded);
  const commonGcd = gcdArray(counts);
  processNodes.forEach(p => {
    p.integerRatio = commonGcd > 0 ? p.countRounded / commonGcd : p.countRounded;
    if (p.machine === '自動廚師機') {
      p.topology = '終端出餐 (大炮發射)';
    } else if (p.machine === '攪拌機') {
      p.topology = p.integerRatio === 1 ? '1:1 專線通液 (1.0 fl/s)' : `雙路/多路專線 (各 1.0 fl/s)`;
    } else if (p.machine === '物質操縱機') {
      p.topology = `異界重構 (需配 ${p.countRounded} 台底料收割機)`;
    } else if (p.machine === '注入機') {
      p.topology = '環境原位轉化 (需專屬抽取泵機)';
    } else if (p.integerRatio === 1) {
      p.topology = '1:1 對等直連';
    } else if (p.integerRatio === 2) {
      p.topology = '1分2均等分流 (自帶雙輸出口)';
    } else {
      p.topology = `專用分流器拓撲 (${p.integerRatio}等分)`;
    }
  });

  // 3. 重構底料收割機 (Matter Manipulator Base Feeder Harvesters)
  // Each active matter manipulator in process table requires 1 base feeder harvester
  const matterManipulatorsCount = processNodes
    .filter(p => p.machine === '物質操縱機')
    .reduce((sum, p) => sum + p.countRounded, 0);

  const baseFeeders = {
    count: matterManipulatorsCount,
    power: matterManipulatorsCount * 1.0, // 1 FV/s per feeder
    goblins: matterManipulatorsCount * 1.0 // 1 goblin per feeder
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
      items
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
      items
    });
  }
}

function assembleResult(params: any): CalculationResult {
  const {
    dishName, targetRate, powerMode, processNodes, baseFeeders,
    sauces, transformations, waterInfo, oilInfo, voidInfo,
    totalRegularPumps, totalOverclockPumps, totalSludgeManipulators, totalPumpManipulatorPower,
    mainEquipmentPower, coalMinerPower, totalLoad, furnaces, coalMiners,
    genSludgeManipulators, coalRate, grossPower, netPower, surplusPower,
    items
  } = params;

  const totalMainMachines = processNodes.reduce((sum: number, p: ProcessNode) => sum + p.countRounded, 0);
  const mainEquipmentGoblins = processNodes.reduce((sum: number, p: ProcessNode) => sum + p.goblins, 0);

  // Total goblins matching Excel D13 = SUM(F17:F100) + D9 + D10 + D12 + B10
  const totalGoblins = mainEquipmentGoblins + baseFeeders.goblins + totalPumpManipulatorPower + furnaces * 1 + coalMiners * 1;

  // Biochemical Warnings
  const biochemicalWarnings: { item: string; type: string; detail: string }[] = [];
  const itemMap = new Map<string, Item>((items as Item[]).map((it: Item) => [it.name, it]));

  processNodes.forEach((p: ProcessNode) => {
    const rawName = p.processName.replace('採集', '').replace('採掘', '').replace('收割', '').replace('重構', '').replace('研磨', '').replace('注入', '').replace('發酵', '').replace('剝皮', '').trim();
    const it = itemMap.get(p.processName) || itemMap.get(rawName);
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
          detail: '含有高致敏物質（如豆肉蔻），必須設置專屬獨立專線，禁止與一般原料共用分流通道。'
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
