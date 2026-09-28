import React from 'react';
import { Calculator, Layers, Database, RefreshCw, ChefHat } from 'lucide-react';

interface HeaderProps {
  activeTab: 'single' | 'parallel' | 'data' | 'sync';
  setActiveTab: (tab: 'single' | 'parallel' | 'data' | 'sync') => void;
  dishesCount: number;
  machinesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  dishesCount,
  machinesCount
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('single')}>
            <div className="bg-amber-500/10 p-2 rounded-xl border border-amber-500/20 text-amber-400">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200 bg-clip-text text-transparent">
                  異食工廠
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono border border-slate-700">
                  Snacktorio v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                自動化產線規劃與遊戲資料管理系統
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'single'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>產線計算機</span>
            </button>

            <button
              onClick={() => setActiveTab('parallel')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'parallel'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>並聯規劃</span>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'data'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Database className="w-4 h-4" />
              <span className="flex items-center space-x-1">
                <span>資料工作台</span>
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-slate-800 text-amber-400">
                  {dishesCount}料理·{machinesCount}機
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sync')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'sync'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">GitHub 同步</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
