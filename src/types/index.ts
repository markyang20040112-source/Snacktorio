export interface Machine {
  category: string;
  name: string;
  goblins: number;
  power: number; // FV/s
  fluidType: string;
  fluidRate: number; // fl/s
  baseRate: string;
  notes: string;
  icon?: string;
}

export interface Item {
  island: string;
  name: string;
  source: string;
  isPerishable: boolean;
  spoilTime?: number | string | null;
  spoilProduct?: string;
  attributes?: string;
  notes?: string;
  isFluid?: boolean;
  icon?: string;
}

export interface RecipeInput {
  name: string;
  count: number;
}

export interface IntermediateRecipe {
  name: string;
  machine: string;
  fluidType: string;
  fluidRate: number;
  inputs: RecipeInput[];
  cycleTime: number; // seconds
  outputCount: number;
  notes?: string;
  icon?: string;
}

export interface Recipe {
  island: string;
  name: string;
  machine: string;
  fluidType: string;
  fluidRate: number;
  inputs: RecipeInput[];
  cycleTime: number; // seconds (usually 5)
  outputCount: number; // usually 1
  notes?: string;
  icon?: string;
}

export interface CalculatorProcess {
  dish: string;
  processName: string;
  machine: string;
  baseRate: number | string;
  power: number;
  goblins: number;
  order?: number;
}

export interface CalculatorMaterial {
  dish: string;
  material: string;
  amount: number | string;
  type: string;
}

export interface DownstreamTarget {
  processName: string;
  machine: string;
  ratio: number;
  isFluid?: boolean;
  isByproduct?: boolean;
  note?: string;
}

export interface ProcessNode {
  processName: string;
  machine: string;
  baseRate: number;
  baseRateDisplay: string;
  demandRate: number;
  countExact: number;
  countRounded: number;
  power: number;
  goblins: number;
  integerRatio: number;
  fluidRate: number;
  fluidType: string;
  topology: string;
  downstreamTargets?: DownstreamTarget[];
  warnings: string[];
  feederRole?: 'donor' | 'recipient';
  feederNote?: string;
  dishTag?: string;
}

export interface FluidTierInfo {
  demand: number;
  regularPumps: number;
  overclockPumps: number;
  sludgeManipulators: number;
  pumpPower: number;
}

export type FeederStrategy = 'dedicated' | 'recycle';

export interface CalculationResult {
  dishName: string;
  targetRate: number; // dishes/s
  targetRateMin: number; // dishes/min
  powerMode: 'regular' | 'overclock'; // 4 FV/s vs 16 FV/s
  feederStrategy: FeederStrategy;
  processes: ProcessNode[];
  isAutoPaired?: boolean;
  pairedDishName?: string;
  pairedDishRate?: number;
  
  // Base feeder harvesters for matter manipulators
  baseFeeders: {
    strategy: FeederStrategy;
    grossRequired: number;
    offsetCount: number;
    count: number;
    offsetSource?: string;
    power: number;
    goblins: number;
    consumerMachine?: string;
    consumerMachines?: string[];
  };

  // Four-Quadrant Fluid Dashboard
  fluids: {
    // Quadrant 2: 調配醬汁 (1:1 dedicated pipes)
    sauces: { name: string; rate: number; dedicatedPipes: number }[];
    // Quadrant 3: 轉化流體專屬抽取泵機 (In-situ transformation pumps)
    transformations: (FluidTierInfo & { name: string; fluid: string })[];
    // Quadrant 4: 外採流體 (水、油、虛空)
    water: FluidTierInfo;
    oil: FluidTierInfo;
    voidFluid: FluidTierInfo & {
      breakdown: {
        processVoid: number;
        generatorSludgeVoid: number;
        pumpSludgeVoid: number;
      };
    };
    // 全廠泵機與操縱機匯總 (Q12, Q13)
    totals: {
      regularPumps: number;
      overclockPumps: number;
      sludgeManipulators: number;
      totalPower: number;
      totalGoblins: number;
    };
  };

  // Quadrant 1: 全廠電網與發電總結算
  powerGrid: {
    mainEquipmentPower: number;
    pumpManipulatorPower: number;
    baseFeederPower: number;
    coalMinerPower: number;
    totalLoad: number;
    furnaces: number;
    coalMiners: number;
    generatorSludgeManipulators: number;
    coalRate: number;
    grossPower: number;
    netPower: number;
    surplusPower: number;
  };

  // 小妖精詳細分項
  goblinsBreakdown: {
    mainEquipment: number;
    baseFeeders: number;
    pumpsAndManipulators: number;
    furnaces: number;
    coalMiners: number;
    total: number;
  };

  totalMachineCount: number;

  biochemicalWarnings: {
    item: string;
    type: string;
    detail: string;
  }[];
}

export interface SyncConfig {
  githubToken?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
}
