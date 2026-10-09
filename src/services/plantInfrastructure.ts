import { FluidTierInfo } from '../types';

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

export interface PlantInfrastructureInput {
  powerMode: 'regular' | 'overclock';
  waterDemand: number;          // 外採水需量 (fl/s)
  oilDemand: number;            // 外採油需量 (fl/s)
  processVoid: number;          // 工序物質操縱機虛空需量 (fl/s)
  transformations: { name: string; fluid: string; demand: number }[]; // 原位轉化抽取需量（已依流體合併）
  mainPower: number;            // 主要生產設備負載 (FV/s)
  feederPower?: number;         // 底料收割機負載 (FV/s)，若已含於 mainPower 則省略
  forceVoidFacility?: boolean;  // 其他使全廠視為有虛空設施之條件（如食譜直接耗用虛空）
}

export type PlantInfrastructureResult = ReturnType<typeof settlePlantInfrastructure>;

/**
 * 全廠基建結算（單一事實來源）：流體泵機自主超頻階梯、虛空閉環（工序 + 泵自耗 + 發電自耗）、
 * 發電熔爐 2:1（常規 4 FV/s）/ 2:1:1（超頻 16 FV/s）配置與電網盈餘。
 * 單料理求解（calculateSingleDish）與多料理並聯（parallelPlanner）共用此函式。
 */
export function settlePlantInfrastructure(input: PlantInfrastructureInput) {
  const { powerMode, waterDemand, oilDemand, processVoid, mainPower, feederPower = 0 } = input;

  // 超頻門檻：全廠有任何虛空設施時 > 2 fl/s，否則 > 6 fl/s
  const hasVoidFacility = !!input.forceVoidFacility ||
                          processVoid > 0 ||
                          powerMode === 'overclock' ||
                          waterDemand > 6.0 ||
                          oilDemand > 6.0 ||
                          input.transformations.some(t => t.demand > 6.0);

  const water = sizeAutonomousPump(waterDemand, hasVoidFacility);
  const oil = sizeAutonomousPump(oilDemand, hasVoidFacility);
  const transformations = input.transformations.map(t => ({
    ...t,
    ...sizeAutonomousPump(t.demand, hasVoidFacility)
  }));

  // 虛空需量 2) 超頻泵機汙泥操縱機自耗：每台超頻泵 1.0 fl/s
  const transSludge = transformations.reduce((sum, t) => sum + t.sludgeManipulators, 0);
  const pumpSludgeVoid = (water.sludgeManipulators + oil.sludgeManipulators + transSludge) * 1.0;

  // 虛空需量 3) 超頻發電 2:1:1 汙泥操縱機：以初估負載推算熔爐數
  const prelimPumpPower = water.pumpPower + oil.pumpPower + transformations.reduce((sum, t) => sum + t.pumpPower, 0);
  const prelimBaseLoad = mainPower + prelimPumpPower + feederPower;
  let genSludgeManipulators = 0;
  let generatorSludgeVoid = 0;
  if (powerMode === 'overclock') {
    const prelimFurnaces = Math.max(1, Math.ceil(prelimBaseLoad / 14.0));
    genSludgeManipulators = Math.ceil(prelimFurnaces / 2.0);
    generatorSludgeVoid = genSludgeManipulators * 1.0;
  }

  // 虛空泵階梯（超頻淨 7 fl/s = 毛 8 扣自耗 1；常規 2 fl/s）
  const totalVoidDemand = Number((processVoid + pumpSludgeVoid + generatorSludgeVoid).toFixed(2));
  let voidOverclockPumps = 0;
  let voidRegularPumps = 0;
  if (totalVoidDemand > 0) {
    const rem7 = totalVoidDemand % 7;
    voidOverclockPumps = Math.floor(totalVoidDemand / 7) + (rem7 > 2.0 ? 1 : 0);
    voidRegularPumps = (rem7 > 0 && rem7 <= 2.0) ? 1 : 0;
  }
  const voidSludgeManipulators = voidOverclockPumps;
  const voidInfo: FluidTierInfo & { breakdown: { processVoid: number; generatorSludgeVoid: number; pumpSludgeVoid: number } } = {
    demand: totalVoidDemand,
    regularPumps: voidRegularPumps,
    overclockPumps: voidOverclockPumps,
    sludgeManipulators: voidSludgeManipulators,
    pumpPower: (voidOverclockPumps + voidRegularPumps + voidSludgeManipulators) * 1.0,
    breakdown: { processVoid, generatorSludgeVoid, pumpSludgeVoid }
  };

  // 全廠泵機與操縱機總計
  const totalRegularPumps = water.regularPumps + oil.regularPumps + voidInfo.regularPumps +
                            transformations.reduce((sum, t) => sum + t.regularPumps, 0);
  const totalOverclockPumps = water.overclockPumps + oil.overclockPumps + voidInfo.overclockPumps +
                              transformations.reduce((sum, t) => sum + t.overclockPumps, 0);
  const totalSludgeManipulators = water.sludgeManipulators + oil.sludgeManipulators + voidInfo.sludgeManipulators +
                                  transformations.reduce((sum, t) => sum + t.sludgeManipulators, 0) +
                                  genSludgeManipulators;
  const totalPumpManipulatorPower = (totalRegularPumps + totalOverclockPumps + totalSludgeManipulators) * 1.0;

  // 電網平衡：常規淨 3.5 FV/s/爐（2 爐 : 1 採煤）；超頻淨 14 FV/s/爐（2 爐 : 1 採煤 : 1 汙泥操縱機）
  const baseForFurnace = mainPower + totalPumpManipulatorPower + feederPower;
  const isOverclock = powerMode === 'overclock';
  const furnaces = Math.max(1, Math.ceil(baseForFurnace / (isOverclock ? 14.0 : 3.5)));
  const coalMiners = Math.ceil(furnaces / 2.0);
  if (isOverclock) genSludgeManipulators = Math.ceil(furnaces / 2.0);
  const grossPower = furnaces * (isOverclock ? 16.0 : 4.0);
  const coalRate = Number((furnaces * 0.1).toFixed(2));
  const coalMinerPower = coalMiners * 1.0;
  const totalLoad = baseForFurnace + coalMinerPower;
  const netPower = isOverclock
    ? grossPower - (coalMinerPower + genSludgeManipulators * 1.0)
    : grossPower - coalMinerPower;
  const surplusPower = Number((netPower - totalLoad).toFixed(2));

  return {
    hasVoidFacility, water, oil, transformations, voidInfo,
    totalRegularPumps, totalOverclockPumps, totalSludgeManipulators, totalPumpManipulatorPower,
    baseForFurnace, furnaces, coalMiners, genSludgeManipulators, coalRate,
    grossPower, netPower, surplusPower, coalMinerPower, totalLoad
  };
}
