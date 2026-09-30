import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ParallelPlanner } from './components/ParallelPlanner/ParallelPlanner';
import { DataManager } from './components/DataManager/DataManager';
import { SyncSettings } from './components/DataManager/SyncSettings';
import { dataService } from './services/dataService';
import { Machine, Item, IntermediateRecipe, Recipe } from './types';
import { ExternalLink } from 'lucide-react';
import { DynamicBackground } from './components/Common/DynamicBackground';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'calculator' | 'data' | 'sync'>('calculator');
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
    <div className="min-h-screen text-slate-100 flex flex-col font-sans relative selection:bg-amber-500 selection:text-slate-950 bg-[#070d10]">
      {/* Dynamic Cycling & Random Ken-Burns Zoom Factory Background */}
      <DynamicBackground />

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          dishesCount={recipes.length}
          machinesCount={machines.length}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'calculator' && (
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

        {/* Industrial Themed Footer */}
        <footer className="mt-auto border-t border-[#1c2e38] bg-[#0b1318]/95 backdrop-blur-md relative z-10">
          <div className="conveyor-caution-slim h-1 w-full opacity-80" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
              <div className="flex items-center space-x-3">
                <img
                  src="/assets/snacktorio_logo.png"
                  alt="Snacktorio"
                  className="h-6 w-auto object-contain pixelated opacity-80"
                />
                <span className="text-slate-500">|</span>
                <span>《異食工廠》(Snacktorio) 自動化產線平衡計算與資料管理系統</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-400">
                <a
                  href="https://store.steampowered.com/app/1902940/Snacktorio/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-amber-400 transition-colors flex items-center space-x-1 text-slate-300 font-bold"
                >
                  <span>Steam 官方商店頁面</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-slate-600">·</span>
                <span>純文字資料驅動</span>
                <span className="text-slate-600">·</span>
                <span>無界展開物理引擎</span>
                <span className="text-slate-600">·</span>
                <span className="text-amber-400 font-mono font-bold bg-[#14232a] px-2 py-0.5 rounded border border-amber-500/20">
                  v1.0.0
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
