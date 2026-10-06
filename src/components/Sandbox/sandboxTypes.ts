export type SandboxNodeType = 
  | 'machine'           // 常規加工/採集/廚師機設備
  | 'environment_pool'  // 環境流體池 (水池, 油池, 虛空裂隙)
  | 'generator'         // 發電熔爐 (常規 4 FV/s, 超頻 16 FV/s)
  | 'pump'              // 泵機 (常規 2 fl/s, 超頻 8 fl/s, 原位抽取)
  | 'splitter'          // 物品分流器 (1 輸入, 2 輸出均分)
  | 'buffer_decay'      // 發酵變質 / 輸送緩衝方塊 (時間推進物理轉換)
  | 'infinite_source';  // 無中生有物料源

export interface PortDefinition {
  id: string;
  name: string;
  type: 'solid' | 'fluid';
  rateRequired?: number; // fl/s 或 個/秒
  rateProvided?: number; // fl/s 或 個/秒
  rateReceived?: number; // 實質接收量 (fl/s 或 個/秒)
  isDeficit?: boolean;   // 是否產能供不應求 (缺料/欠壓)
}

export interface SandboxNodeData {
  id: string;
  type: SandboxNodeType;
  title: string;
  machineName?: string;       // 對應 machines.json 中的名稱
  recipeName?: string;        // 選定的中間配方或食譜名稱
  island?: string;
  
  // 座標 (Canvas 座標)
  x: number;
  y: number;

  // 物理與運轉參數
  powerMode?: 'regular' | 'overclock'; // 用於發電熔爐或泵機
  isMockInfiniteSupply?: boolean;      // 無中生有：原料無限供應
  overclockPercent?: number;          // 超頻百分比 (預設 100%)
  splitterMode?: 'equal' | 'custom';  // 分流器模式：均分 或 自訂指定流量
  splitterCustomRates?: number[];     // 自訂各端口輸出限流 (個/秒)
  targetRatePerMin?: number;          // 終端料理目標產能 (份/分，如 12, 24, 36)
  isAutoPepto?: boolean;              // 隨炙熱菜餚自動配餐之胃復慘節點
  autoPeptoTrackingRate?: number;     // 當前追蹤之全廠炙熱菜餚總和產能 (份/分)

  // 額定標準參數 (來自資料庫)
  baseCycleTime: number;              // 基準加工週期 (秒)
  baseOutputCount: number;            // 單次產量
  basePowerConsumption: number;       // FV/s
  baseGoblins: number;                // 打工小妖精需求

  // 即時物理演算結果 (由 sandboxPhysics 動態注入)
  actualCycleTime: number;            // 實質加工週期 (受流體/固體欠壓拉長)
  efficiency: number;                 // 運轉稼動率 (0% ~ 100%)
  actualPower: number;                // 即時耗電 / 發電 (FV/s)
  actualGoblins: number;              // 即時妖精數
  fluidSaturation: number;            // 流體滿足率 (0 ~ 1, 1 為滿載 100%)
  solidSaturation: number;            // 固體滿足率 (0 ~ 1)
  statusNote?: string;                // 狀態說明 (如：流體欠壓 50%，週期延長為 2 倍)

  // 輸入/輸出端口
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

export interface SandboxConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  itemOrFluidName: string;
  type: 'solid' | 'fluid';
  actualFlowRate: number; // 實質輸送流率
}

export interface SandboxState {
  nodes: SandboxNodeData[];
  connections: SandboxConnection[];
  pan: { x: number; y: number };
  zoom: number;
}

export interface SandboxMetrics {
  totalPowerGen: number;       // 總發電 FV/s
  totalPowerLoad: number;      // 總負載 FV/s
  powerBalance: number;        // 電網盈虧 FV/s
  totalGoblins: number;        // 總小妖精需求
  machineCount: number;        // 總機台數
  fluidsSummary: {
    water: { produced: number; consumed: number };
    oil: { produced: number; consumed: number };
    void: { produced: number; consumed: number };
    custom: Record<string, { produced: number; consumed: number }>;
  };
  terminalDishes: {
    dishName: string;
    ratePerMin: number;
    efficiency: number;
  }[];
}
