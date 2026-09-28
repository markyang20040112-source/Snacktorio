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

class DataService {
  private machines: Machine[] = [];
  private items: Item[] = [];
  private intermediate: IntermediateRecipe[] = [];
  private recipes: Recipe[] = [];
  private calcProcesses: CalculatorProcess[] = [];
  private calcMaterials: CalculatorMaterial[] = [];

  constructor() {
    this.loadAll();
  }

  public loadAll() {
    try {
      const m = localStorage.getItem(STORAGE_KEYS.MACHINES);
      this.machines = m ? JSON.parse(m) : initialMachines;

      const it = localStorage.getItem(STORAGE_KEYS.ITEMS);
      this.items = it ? JSON.parse(it) : initialItems;

      const ir = localStorage.getItem(STORAGE_KEYS.INTERMEDIATE);
      this.intermediate = ir ? JSON.parse(ir) : initialIntermediate;

      const r = localStorage.getItem(STORAGE_KEYS.RECIPES);
      this.recipes = r ? JSON.parse(r) : initialRecipes;

      const cd = localStorage.getItem(STORAGE_KEYS.CALC_DB);
      if (cd) {
        const parsed = JSON.parse(cd);
        this.calcProcesses = parsed.processes || [];
        this.calcMaterials = parsed.materials || [];
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

  // Save methods
  public async saveMachines(machines: Machine[]) {
    this.machines = machines;
    localStorage.setItem(STORAGE_KEYS.MACHINES, JSON.stringify(machines));
    await this.tryLocalDiskSave({ machines });
  }

  public async saveItems(items: Item[]) {
    this.items = items;
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
    await this.tryLocalDiskSave({ items });
  }

  public async saveIntermediateRecipes(intermediate: IntermediateRecipe[]) {
    this.intermediate = intermediate;
    localStorage.setItem(STORAGE_KEYS.INTERMEDIATE, JSON.stringify(intermediate));
    await this.tryLocalDiskSave({ intermediateRecipes: intermediate });
  }

  public async saveRecipes(recipes: Recipe[]) {
    this.recipes = recipes;
    localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(recipes));
    await this.tryLocalDiskSave({ recipes });
  }

  public async saveCalculatorDb(processes: CalculatorProcess[], materials: CalculatorMaterial[]) {
    this.calcProcesses = processes;
    this.calcMaterials = materials;
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
