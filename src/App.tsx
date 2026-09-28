import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SingleCalculator } from './components/Calculator/SingleCalculator';
import { ParallelPlanner } from './components/ParallelPlanner/ParallelPlanner';
import { DataManager } from './components/DataManager/DataManager';
import { SyncSettings } from './components/DataManager/SyncSettings';
import { dataService } from './services/dataService';
import { Machine, Item, IntermediateRecipe, Recipe } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'single' | 'parallel' | 'data' | 'sync'>('single');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [intermediate, setIntermediate] = useState<IntermediateRecipe[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const refreshAll = () => {
    setMachines(dataService.getMachines());
    setItems(dataService.getItems());
    setIntermediate(dataService.getIntermediateRecipes());
    setRecipes(dataService.getRecipes());
  };

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dishesCount={recipes.length}
        machinesCount={machines.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'single' && (
          <SingleCalculator recipes={recipes} />
        )}

        {activeTab === 'parallel' && (
          <ParallelPlanner recipes={recipes} />
        )}

        {activeTab === 'data' && (
          <DataManager
            machines={machines}
            items={items}
            intermediate={intermediate}
            recipes={recipes}
            onRefreshAll={refreshAll}
          />
        )}

        {activeTab === 'sync' && (
          <SyncSettings />
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            《異食工廠》(Snacktorio) 產線平衡計算與資料管理系統 · 開源自動化架構
          </div>
          <div className="flex items-center space-x-4 text-slate-400">
            <span>純文字資料驅動</span>
            <span>·</span>
            <span>Git / GitHub Pages 友善</span>
            <span>·</span>
            <span className="text-amber-500 font-mono">v1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
