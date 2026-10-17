import { Machine } from '../types';
import { dataService } from '../services/dataService';

/**
 * 從 machines.json 讀取指定機台之標準耗電與哥布林配置（單一事實來源）
 */
export function machineSpec(
  name: string,
  machines: Machine[] = dataService.getMachines()
): { name: string; power: number; goblins: number } {
  const found = machines.find(m => m.name === name);
  return {
    name: found?.name ?? name,
    power: found?.power ?? 1.0,
    goblins: found?.goblins ?? 1
  };
}
