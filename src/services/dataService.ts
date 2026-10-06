import initialMachines from '../data/machines.json';
import initialItems from '../data/items.json';
import initialIntermediate from '../data/intermediateRecipes.json';
import initialRecipes from '../data/recipes.json';
import initialCalcDb from '../data/calculatorDb.json';
import { Machine, Item, IntermediateRecipe, Recipe, CalculatorProcess, CalculatorMaterial } from '../types';

const STORAGE_KEYS = {
  MACHINES: 'snacktorio_machines_v1',
  ITEMS: 'snacktorio_items_v1',
  INTERMEDIATE: 'snacktorio_intermediate_v1',
  RECIPES: 'snacktorio_recipes_v1',
  CALC_DB: 'snacktorio_calc_db_v1',
  SYNC_CONFIG: 'snacktorio_sync_config_v1'
};

const PURGED_TERRAIN_NAMES = new Set([
  '鹽(礦石方塊)', '煤炭(礦石方塊)', '豆肉蔻(礦石方塊)', '香豆蔻(香料方塊)',
  '日桂葉植株', '塔瑪茄植株', '洋蔥蔥植株', '·椒植株', '歐琴植株',
  '小蒜植株', '水稻植株', '菠菜植株', '油荳蔻植株', '辣椒植株'
]);

class DataService {
  private machines: Machine[] = [];
  private items: Item[] = [];
  private intermediate: IntermediateRecipe[] = [];
  private recipes: Recipe[] = [];
  private calcProcesses: CalculatorProcess[] = [];
  private calcMaterials: CalculatorMaterial[] = [];
  /** 資料版本號：任何載入 / 儲存 / 匯入都會遞增，供衍生快取（如官方藍圖）判斷是否需重建 */
  private revision = 0;

  constructor() {
    this.loadAll();
  }

  public getRevision(): number { return this.revision; }

  public loadAll() {
    this.revision++;
    try {
      const m = localStorage.getItem(STORAGE_KEYS.MACHINES);
      if (m) {
        const parsedM = JSON.parse(m);
        const existingMachineNames = new Set(parsedM.map((mac: any) => mac.name));
        const missingMachines = (initialMachines as Machine[]).filter(mac => !existingMachineNames.has(mac.name));
        this.machines = [...parsedM, ...missingMachines];
      } else {
        this.machines = initialMachines;
      }

      const it = localStorage.getItem(STORAGE_KEYS.ITEMS);
      if (it) {
        let parsedIt: Item[] = JSON.parse(it);
        const originalLen = parsedIt.length;
        // 自動剔除地圖地塊虛擬殘留項
        parsedIt = parsedIt.filter(i => !PURGED_TERRAIN_NAMES.has(i.name));
        const existingItemNames = new Set(parsedIt.map(i => i.name));
        const missingItems = (initialItems as Item[]).filter(i => !existingItemNames.has(i.name));
        this.items = [...parsedIt, ...missingItems].map(item => {
          const init = (initialItems as Item[]).find(i => i.name === item.name);
          if (init && (!item.source || item.attributes === '無') && (init.source || init.attributes !== '無')) {
            return {
              ...item,
              source: init.source || item.source,
              attributes: init.attributes !== '無' ? init.attributes : item.attributes,
              notes: init.notes || item.notes
            };
          }
          return item;
        });
        if (parsedIt.length !== originalLen || missingItems.length > 0) {
          localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(this.items));
        }
      } else {
        this.items = initialItems;
      }

      const ir = localStorage.getItem(STORAGE_KEYS.INTERMEDIATE);
      if (ir) {
        let parsedIr: IntermediateRecipe[] = JSON.parse(ir);
        const originalIrLen = parsedIr.length;
        // 自動剔除過時的地圖開採/收割偽配方，確保自然採集為單一事實來源
        parsedIr = parsedIr.filter(rec => 
          !PURGED_TERRAIN_NAMES.has(rec.name) && 
          rec.machine !== '採掘機' && 
          rec.machine !== '收割機'
        );
        const existingIrNames = new Set(parsedIr.map((rec: any) => rec.name));
        const missingIr = (initialIntermediate as IntermediateRecipe[]).filter(rec => !existingIrNames.has(rec.name));
        const changed = parsedIr.length !== originalIrLen;
        this.intermediate = [...parsedIr, ...missingIr];
        if (changed || missingIr.length > 0) {
          localStorage.setItem(STORAGE_KEYS.INTERMEDIATE, JSON.stringify(this.intermediate));
        }
      } else {
        this.intermediate = initialIntermediate;
      }

      const r = localStorage.getItem(STORAGE_KEYS.RECIPES);
      if (r) {
        const parsedR: Recipe[] = JSON.parse(r);
        const existingNames = new Set(parsedR.map(rec => rec.name));
        const missing = (initialRecipes as Recipe[]).filter(rec => !existingNames.has(rec.name));
        this.recipes = [...parsedR, ...missing];
      } else {
        this.recipes = initialRecipes;
      }

      const cd = localStorage.getItem(STORAGE_KEYS.CALC_DB);
      if (cd) {
        const parsed = JSON.parse(cd);
        const existingDishes = new Set((parsed.processes || []).map((p: any) => p.dish));
        const missingProcesses = (initialCalcDb.processes as CalculatorProcess[]).filter(p => !existingDishes.has(p.dish));
        const missingMaterials = (initialCalcDb.materials as CalculatorMaterial[]).filter(m => !existingDishes.has(m.dish));
        this.calcProcesses = [...(parsed.processes || []), ...missingProcesses];
        this.calcMaterials = [...(parsed.materials || []), ...missingMaterials];
      } else {
        this.calcProcesses = initialCalcDb.processes;
        this.calcMaterials = initialCalcDb.materials;
      }
    } catch (e) {
      console.error('Failed to load from localStorage, falling back to defaults', e);
      this.machines = initialMachines;
      this.items = initialItems;
      this.intermediate = initialIntermediate;
      this.recipes = initialRecipes;
      this.calcProcesses = initialCalcDb.processes;
      this.calcMaterials = initialCalcDb.materials;
    }
  }

  // Getters
  public getMachines(): Machine[] { return [...this.machines]; }
  public getItems(): Item[] { return [...this.items]; }
  public getIntermediateRecipes(): IntermediateRecipe[] { return [...this.intermediate]; }
  public getRecipes(): Recipe[] { return [...this.recipes]; }
  public getCalculatorDb() {
    return {
      processes: [...this.calcProcesses],
      materials: [...this.calcMaterials]
    };
  }

  public getCustomIconMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const item of this.items) {
      if (item.name && item.icon && item.icon !== 'none') {
        map[item.name] = item.icon;
      }
    }
    for (const ir of this.intermediate) {
      if (ir.name && ir.icon && ir.icon !== 'none') {
        map[ir.name] = ir.icon;
      }
    }
    for (const m of this.machines) {
      if (m.name && m.icon && m.icon !== 'none') {
        map[m.name] = m.icon;
      }
    }
    return map;
  }

  // Save methods
  public async saveMachines(machines: Machine[]) {
    this.machines = machines;
    this.revision++;
    localStorage.setItem(STORAGE_KEYS.MACHINES, JSON.stringify(machines));
    await this.tryLocalDiskSave({ machines });
  }

  public async saveItems(items: Item[]) {
    this.items = items;
    this.revision++;
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
    await this.tryLocalDiskSave({ items });
  }

  public async saveIntermediateRecipes(intermediate: IntermediateRecipe[]) {
    this.intermediate = intermediate;
    this.revision++;
    localStorage.setItem(STORAGE_KEYS.INTERMEDIATE, JSON.stringify(intermediate));
    await this.tryLocalDiskSave({ intermediateRecipes: intermediate });
  }

  public async saveRecipes(recipes: Recipe[]) {
    this.recipes = recipes;
    this.revision++;
    localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(recipes));
    await this.tryLocalDiskSave({ recipes });
  }

  public async saveCalculatorDb(processes: CalculatorProcess[], materials: CalculatorMaterial[]) {
    this.calcProcesses = processes;
    this.calcMaterials = materials;
    this.revision++;
    localStorage.setItem(STORAGE_KEYS.CALC_DB, JSON.stringify({ processes, materials }));
    await this.tryLocalDiskSave({ calculatorDb: { processes, materials } });
  }

  // Attempt to write directly to disk if running locally via Vite dev server
  public async tryLocalDiskSave(payload: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch('/api/save-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      // Ignore if running on static hosting like GitHub Pages
      return false;
    }
  }

  // Export all as JSON string or download
  public exportAllData(): string {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      machines: this.machines,
      items: this.items,
      intermediateRecipes: this.intermediate,
      recipes: this.recipes,
      calculatorDb: {
        processes: this.calcProcesses,
        materials: this.calcMaterials
      }
    }, null, 2);
  }

  public importAllData(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      this.revision++;
      if (data.machines) this.machines = data.machines;
      if (data.items) this.items = data.items;
      if (data.intermediateRecipes) this.intermediate = data.intermediateRecipes;
      if (data.recipes) this.recipes = data.recipes;
      if (data.calculatorDb) {
        this.calcProcesses = data.calculatorDb.processes || [];
        this.calcMaterials = data.calculatorDb.materials || [];
      }
      localStorage.setItem(STORAGE_KEYS.MACHINES, JSON.stringify(this.machines));
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(this.items));
      localStorage.setItem(STORAGE_KEYS.INTERMEDIATE, JSON.stringify(this.intermediate));
      localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(this.recipes));
      localStorage.setItem(STORAGE_KEYS.CALC_DB, JSON.stringify({ processes: this.calcProcesses, materials: this.calcMaterials }));
      this.tryLocalDiskSave({
        machines: this.machines,
        items: this.items,
        intermediateRecipes: this.intermediate,
        recipes: this.recipes,
        calculatorDb: { processes: this.calcProcesses, materials: this.calcMaterials }
      });
      return true;
    } catch (e) {
      console.error('Failed to import data', e);
      return false;
    }
  }

  public resetToDefault() {
    localStorage.removeItem(STORAGE_KEYS.MACHINES);
    localStorage.removeItem(STORAGE_KEYS.ITEMS);
    localStorage.removeItem(STORAGE_KEYS.INTERMEDIATE);
    localStorage.removeItem(STORAGE_KEYS.RECIPES);
    localStorage.removeItem(STORAGE_KEYS.CALC_DB);
    this.loadAll();
  }
}

export const dataService = new DataService();
