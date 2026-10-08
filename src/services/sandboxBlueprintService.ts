import { SandboxBlueprint, SandboxNodeData, SandboxConnection } from '../components/Sandbox/sandboxTypes';
import { SyncConfig, Recipe } from '../types';
import { syncDataToGitHub } from './githubSync';
import { buildDishBlueprint } from './dishBlueprintGenerator';
import { getBuiltInBlueprints } from './builtInBlueprints';
import { dataService } from './dataService';

const STORAGE_KEY = 'snacktorio_sandbox_blueprints_v1';
const DELETED_KEY = 'snacktorio_sandbox_deleted_builtins_v1';
const BUILTIN_VERSION = '20261008_v15_left_pump_sidebar_and_parallel_power';
const VERSION_KEY = 'snacktorio_sandbox_builtin_version';


export const isOfficialDishBlueprint = (bp: SandboxBlueprint) =>
  bp.id.startsWith('bp_dish_') || bp.id.startsWith('bp_recipe_');

export const isOfficialTutorialBlueprint = (bp: SandboxBlueprint) =>
  bp.id === 'bp_starter_generator' || bp.id === 'bp_tutorial_power';

class SandboxBlueprintService {
  private getDeletedIds(): Set<string> {
    try {
      const saved = localStorage.getItem(DELETED_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  }

  private saveDeletedIds(ids: Set<string>) {
    try {
      localStorage.setItem(DELETED_KEY, JSON.stringify([...ids]));
    } catch {}
  }

  /**
   * 取得完整內建/官方料理藍圖清單 (依目前資料庫執行期自動生成，含未來新登錄之料理)
   */
  public getBuiltInAndDynamicBlueprints(): SandboxBlueprint[] {
    return getBuiltInBlueprints();
  }

  /**
   * 取得所有儲存之產線專案 (自動合併官方全套食譜藍圖與使用者自訂/副本專案)
   */
  public getAllBlueprints(): SandboxBlueprint[] {
    const builtInList = this.getBuiltInAndDynamicBlueprints();
    try {
      const savedVersion = localStorage.getItem(VERSION_KEY);
      const isOutdatedVersion = savedVersion !== BUILTIN_VERSION;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const deletedIds = this.getDeletedIds();

          if (isOutdatedVersion) {
            // 版本升級：全面更新官方預設藍圖為最新版本 (修復物理產能問題)，同時完整保留使用者自創/副本專案
            const builtInIds = new Set(builtInList.map(bp => bp.id));
            const userCustomBlueprints = parsed.filter(bp => !builtInIds.has(bp.id));
            const activeBuiltIns = builtInList.filter(bp => !deletedIds.has(bp.id));
            const merged = [...userCustomBlueprints, ...activeBuiltIns];
            this.saveList(merged);
            localStorage.setItem(VERSION_KEY, BUILTIN_VERSION);
            return merged;
          }

          const savedIds = new Set(parsed.map(bp => bp.id));

          // 自動補入使用者本地尚未擁有的官方預設藍圖 (且未被使用者主動刪除)
          const missingBuiltIns = builtInList.filter(
            bp => !savedIds.has(bp.id) && !deletedIds.has(bp.id)
          );

          if (missingBuiltIns.length > 0) {
            // 合併：保留使用者自訂/修改專案在前方，官方預設補在後方
            const merged = [...parsed, ...missingBuiltIns];
            this.saveList(merged);
            return merged;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error('無法讀取本機產線專案列表', e);
    }

    // 初次載入或本地為空
    this.saveList(builtInList);
    try {
      localStorage.setItem(VERSION_KEY, BUILTIN_VERSION);
    } catch {}
    return builtInList;
  }


  /**
   * 依 ID 取得單一產線專案
   */
  public getBlueprintById(id: string): SandboxBlueprint | undefined {
    return this.getAllBlueprints().find(bp => bp.id === id);
  }

  /**
   * 提取專案統計摘要 (機台數、用電量、終端菜餚名稱)
   */
  private extractStats(nodes: SandboxNodeData[]) {
    const machineCount = nodes.filter(n => n.type === 'machine' || n.type === 'generator' || n.type === 'pump').length;
    const powerLoad = nodes.reduce((sum, n) => {
      if (n.type === 'generator') return sum;
      return sum + (n.actualPower || n.basePowerConsumption || 0);
    }, 0);

    const mainDishes: string[] = [];
    nodes.forEach(n => {
      if (n.machineName === '自動廚師機' && n.recipeName && !mainDishes.includes(n.recipeName)) {
        mainDishes.push(n.recipeName);
      }
    });

    return {
      machineCount,
      powerLoad: Number(powerLoad.toFixed(2)),
      mainDishes
    };
  }

  /**
   * 儲存產線專案 (支援新增或覆寫修改既有專案)
   */
  public saveBlueprint(params: {
    name: string;
    nodes: SandboxNodeData[];
    connections: SandboxConnection[];
    pan?: { x: number; y: number };
    zoom?: number;
    description?: string;
    existingId?: string;
  }): SandboxBlueprint {
    const currentList = this.getAllBlueprints();
    const now = new Date().toISOString();
    const stats = this.extractStats(params.nodes);

    if (params.existingId) {
      // 覆寫既有專案
      const index = currentList.findIndex(bp => bp.id === params.existingId);
      if (index >= 0) {
        const updated: SandboxBlueprint = {
          ...currentList[index],
          name: params.name.trim() || currentList[index].name,
          description: params.description ?? currentList[index].description,
          updatedAt: now,
          nodes: params.nodes,
          connections: params.connections,
          pan: params.pan,
          zoom: params.zoom,
          stats
        };
        currentList[index] = updated;
        this.saveList(currentList);
        return updated;
      }
    }

    // 建立新專案
    const newBp: SandboxBlueprint = {
      id: `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: params.name.trim() || `產線專案 ${currentList.length + 1}`,
      description: params.description || '',
      createdAt: now,
      updatedAt: now,
      nodes: params.nodes,
      connections: params.connections,
      pan: params.pan,
      zoom: params.zoom,
      stats
    };

    const updatedList = [newBp, ...currentList];
    this.saveList(updatedList);
    return newBp;
  }

  /**
   * 複製專案副本 (Fork / Duplicate)
   */
  public duplicateBlueprint(id: string): SandboxBlueprint | null {
    const currentList = this.getAllBlueprints();
    const target = currentList.find(bp => bp.id === id);
    if (!target) return null;

    const now = new Date().toISOString();
    const newId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // 生成深拷貝並重構內部節點 ID 映射，確保連線完整對齊
    const idMap = new Map<string, string>();
    const clonedNodes: SandboxNodeData[] = target.nodes.map(n => {
      const clonedNodeId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      idMap.set(n.id, clonedNodeId);
      return {
        ...n,
        id: clonedNodeId,
        inputs: n.inputs.map(p => ({ ...p })),
        outputs: n.outputs.map(p => ({ ...p }))
      };
    });

    const clonedConns: SandboxConnection[] = target.connections.map(c => ({
      ...c,
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fromNodeId: idMap.get(c.fromNodeId) || c.fromNodeId,
      toNodeId: idMap.get(c.toNodeId) || c.toNodeId
    }));

    const clonedBp: SandboxBlueprint = {
      ...target,
      id: newId,
      name: `(副本) ${target.name}`,
      createdAt: now,
      updatedAt: now,
      nodes: clonedNodes,
      connections: clonedConns
    };

    this.saveList([clonedBp, ...currentList]);
    return clonedBp;
  }

  /**
   * 刪除專案 (若為官方預設專案則記錄已刪除，避免自動復活)
   */
  public deleteBlueprint(id: string): boolean {
    const currentList = this.getAllBlueprints();
    const filtered = currentList.filter(bp => bp.id !== id);
    if (filtered.length !== currentList.length) {
      const builtInList = this.getBuiltInAndDynamicBlueprints();
      if (builtInList.some(bp => bp.id === id)) {
        const deletedIds = this.getDeletedIds();
        deletedIds.add(id);
        this.saveDeletedIds(deletedIds);
      }
      this.saveList(filtered);
      return true;
    }
    return false;
  }

  /**
   * 重置並恢復所有官方食譜藍圖庫 (同時安全保留所有使用者自創專案與副本)
   */
  public restoreOfficialBlueprints(): SandboxBlueprint[] {
    try {
      localStorage.removeItem(DELETED_KEY);
    } catch {}

    const builtInList = this.getBuiltInAndDynamicBlueprints();
    const currentList = this.getAllBlueprints();

    // 找出使用者自訂/副本專案 (非官方 ID)
    const builtInIds = new Set(builtInList.map(bp => bp.id));
    const userCustomBlueprints = currentList.filter(bp => !builtInIds.has(bp.id));

    // 合併：使用者專案在最前，官方全量食譜藍圖在後
    const restored = [...userCustomBlueprints, ...builtInList];
    this.saveList(restored);
    return restored;
  }

  /**
   * 為新食譜即時生成專案藍圖並直接寫入專案庫 (供 RecipeManager 登錄新食譜時自動調用)
   */
  public generateAndSaveRecipeBlueprint(dish: Recipe): SandboxBlueprint {
    const allRecipes = dataService.getRecipes();
    const idx = allRecipes.findIndex(r => r.name === dish.name);
    const bp = buildDishBlueprint(dish, idx >= 0 ? idx : allRecipes.length);

    const currentList = this.getAllBlueprints();
    const existingIndex = currentList.findIndex(b => b.id === bp.id || b.stats?.mainDishes.includes(dish.name));

    let updatedList: SandboxBlueprint[];
    if (existingIndex >= 0) {
      currentList[existingIndex] = bp;
      updatedList = [...currentList];
    } else {
      updatedList = [bp, ...currentList];
    }

    this.saveList(updatedList);
    return bp;
  }

  /**
   * 重新命名專案
   */
  public renameBlueprint(id: string, newName: string): boolean {
    const currentList = this.getAllBlueprints();
    const target = currentList.find(bp => bp.id === id);
    if (target && newName.trim()) {
      target.name = newName.trim();
      target.updatedAt = new Date().toISOString();
      this.saveList(currentList);
      return true;
    }
    return false;
  }

  /**
   * 單一專案匯出為 JSON 檔案
   */
  public exportSingleBlueprintJson(bp: SandboxBlueprint) {
    const blob = new Blob([JSON.stringify(bp, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bp.name.replace(/[\\/:*?"<>|]/g, '_')}.snacktorio.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 全量產線專案庫匯出為 JSON 檔案
   */
  public exportAllBlueprintsJson() {
    const list = this.getAllBlueprints();
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snacktorio_sandbox_blueprints_all_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 匯入 JSON 藍圖專案檔案 (支援單一專案物件或專案陣列)
   */
  public importBlueprintsJson(jsonStr: string): { success: boolean; importedCount: number; message: string } {
    try {
      const data = JSON.parse(jsonStr);
      const currentList = this.getAllBlueprints();
      const existingIds = new Set(currentList.map(b => b.id));
      let count = 0;

      const itemsToAdd: SandboxBlueprint[] = [];
      const processItem = (item: any) => {
        if (!item || !Array.isArray(item.nodes) || !Array.isArray(item.connections)) return;
        const validItem: SandboxBlueprint = {
          id: existingIds.has(item.id) ? `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` : (item.id || `bp_${Date.now()}`),
          name: item.name || `匯入專案 ${count + 1}`,
          description: item.description || '',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nodes: item.nodes,
          connections: item.connections,
          pan: item.pan || { x: 0, y: 0 },
          zoom: item.zoom || 1,
          stats: item.stats || this.extractStats(item.nodes)
        };
        itemsToAdd.push(validItem);
        count++;
      };

      if (Array.isArray(data)) {
        data.forEach(processItem);
      } else {
        processItem(data);
      }

      if (count > 0) {
        this.saveList([...itemsToAdd, ...currentList]);
        return { success: true, importedCount: count, message: `✅ 成功匯入 ${count} 個產線專案！` };
      }
      return { success: false, importedCount: 0, message: '❌ JSON 格式不符合 Snacktorio 產線專案規格。' };
    } catch (e: any) {
      return { success: false, importedCount: 0, message: `匯入失敗: ${e.message}` };
    }
  }

  /**
   * 一鍵將所有專案與核心資料庫同步並提交至 GitHub
   */
  public async syncToGitHub(config: SyncConfig, commitMessage?: string): Promise<{ success: boolean; message: string }> {
    const msg = commitMessage || `feat(sandbox): update ${this.getAllBlueprints().length} saved blueprints from web workbench`;
    return await syncDataToGitHub(config, msg);
  }

  private saveList(list: SandboxBlueprint[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('儲存產線專案失敗', e);
    }
  }
}

export const sandboxBlueprintService = new SandboxBlueprintService();
