import React, { useState } from 'react';
import { Machine, Item, IntermediateRecipe, Recipe } from '../../types';
import { MachineManager } from './MachineManager';
import { ItemManager } from './ItemManager';
import { IntermediateManager } from './IntermediateManager';
import { RecipeManager } from './RecipeManager';
import { Download, Upload, RotateCcw, CheckCircle } from 'lucide-react';
import { dataService } from '../../services/dataService';

interface DataManagerProps {
  machines: Machine[];
  items: Item[];
  intermediate: IntermediateRecipe[];
  recipes: Recipe[];
  onRefreshAll: () => void;
}

export const DataManager: React.FC<DataManagerProps> = ({
  machines,
  items,
  intermediate,
  recipes,
  onRefreshAll
}) => {
  const [subTab, setSubTab] = useState<'machines' | 'items' | 'intermediate' | 'recipes'>('recipes');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleSaveMachines = async (newMachines: Machine[]) => {
    await dataService.saveMachines(newMachines);
    onRefreshAll();
    showStatus('✅ 機器設備資料已儲存！');
  };

  const handleSaveItems = async (newItems: Item[]) => {
    await dataService.saveItems(newItems);
    onRefreshAll();
    showStatus('✅ 食材與物品資料已儲存！');
  };

  const handleSaveIntermediate = async (newIntermediate: IntermediateRecipe[]) => {
    await dataService.saveIntermediateRecipes(newIntermediate);
    onRefreshAll();
    showStatus('✅ 中間配方資料已儲存！');
  };

  const handleSaveRecipes = async (newRecipes: Recipe[]) => {
    await dataService.saveRecipes(newRecipes);
    onRefreshAll();
    showStatus('✅ 終端食譜資料已儲存！');
  };

  const handleExportJson = () => {
    const jsonStr = dataService.exportAllData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snacktorio_data_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('📥 已成功下載全庫 JSON 備份檔！');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (dataService.importAllData(content)) {
        onRefreshAll();
        showStatus('🎉 JSON 備份資料已成功匯入！');
      } else {
        alert('匯入失敗：JSON 格式不正確。');
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (confirm('確定要清除所有自訂修改，並恢復為遊戲初始預設資料嗎？')) {
      dataService.resetToDefault();
      onRefreshAll();
      showStatus('🔄 已重置為預設資料！');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Subtabs & Backup actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Sub-nav */}
        <div className="flex flex-wrap gap-1 sm:gap-2">
          <button
            onClick={() => setSubTab('recipes')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              subTab === 'recipes'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            🍲 終端料理 ({recipes.length})
          </button>

          <button
            onClick={() => setSubTab('intermediate')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              subTab === 'intermediate'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            ⚙️ 中間配方 ({intermediate.length})
          </button>

          <button
            onClick={() => setSubTab('items')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              subTab === 'items'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            🥗 食材生化 ({items.length})
          </button>

          <button
            onClick={() => setSubTab('machines')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              subTab === 'machines'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            🏭 機器設備 ({machines.length})
          </button>
        </div>

        {/* Quick Tools */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={handleExportJson}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-xl border border-slate-800 transition-colors"
            title="下載全庫 JSON 備份檔"
          >
            <Download className="w-3.5 h-3.5" />
            <span>匯出 JSON</span>
          </button>

          <label className="flex items-center space-x-1 px-3 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer" title="匯入 JSON 備份檔">
            <Upload className="w-3.5 h-3.5" />
            <span>匯入 JSON</span>
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>

          <button
            onClick={handleReset}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-950 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl border border-slate-800 transition-colors"
            title="恢復為遊戲初始預設資料"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">重置</span>
          </button>
        </div>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-amber-500/40 text-amber-300 px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-sm font-bold animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Sub-view Rendering */}
      {subTab === 'recipes' && (
        <RecipeManager
          recipes={recipes}
          items={items}
          intermediate={intermediate}
          onSave={handleSaveRecipes}
        />
      )}

      {subTab === 'intermediate' && (
        <IntermediateManager
          intermediate={intermediate}
          machines={machines}
          items={items}
          onSave={handleSaveIntermediate}
        />
      )}

      {subTab === 'items' && (
        <ItemManager
          items={items}
          onSave={handleSaveItems}
        />
      )}

      {subTab === 'machines' && (
        <MachineManager
          machines={machines}
          onSave={handleSaveMachines}
        />
      )}
    </div>
  );
};
