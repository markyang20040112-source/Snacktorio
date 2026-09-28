export interface Machine {
  category: string;
  name: string;
  goblins: number;
  power: number; // FV/s
  fluidType: string;
  fluidRate: number; // fl/s
  baseRate: string;
  notes: string;
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
}

export interface CalculatorProcess {
  dish: string;
  processName: string;
  machine: string;
  baseRate: number | string;
  power: number;
  goblins: number;
  order: number;
}

export interface CalculatorMaterial {
  dish: string;
  material: string;
  amount: number | string;
  type: string;
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
  warnings: string[];
}

export interface CalculationResult {
  dishName: string;
  targetRate: number; // dishes/s
  targetRateMin: number; // dishes/min
  powerMode: 'regular' | 'overclock'; // 4 FV/s vs 16 FV/s
  processes: ProcessNode[];
  totalMachineCount: number;
  totalPower: number;
  totalGoblins: number;
  fluids: {
    sauces: { name: string; rate: number; dedicatedPipes: number }[];
    inSituTransformations: { name: string; fluid: string; pumpsNeeded: number; rate: number }[];
    water: { demand: number; regularPumps: number; overclockPumps: number; pumpPower: number };
    oil: { demand: number; regularPumps: number; overclockPumps: number; pumpPower: number };
    voidFluid: { demand: number; regularPumps: number; overclockPumps: number; pumpPower: number; sludgeSelfLoss: number };
  };
  powerSupply: {
    furnaces: number;
    coalMiners: number;
    sludgeManipulators: number;
    coalRate: number;
    grossFV: number;
    netFV: number;
    surplusFV: number;
  };
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
