import React from 'react';
import { Calculator, Database, RefreshCw, ExternalLink } from 'lucide-react';

interface HeaderProps {
  activeTab: 'calculator' | 'data' | 'sync';
  setActiveTab: (tab: 'calculator' | 'data' | 'sync') => void;
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
    <header className="sticky top-0 z-40 shadow-2xl">
      {/* Snacktorio Conveyor Caution Warning Stripe */}
      <div className="conveyor-caution-slim h-1 w-full opacity-90 shadow-sm" />

      {/* Main Navigation Bar */}
      <div className="bg-[#0e171c]/95 backdrop-blur-md border-b border-[#20343f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
            
            {/* Authentic Logo & Game Branding */}
            <div 
              className="flex items-center space-x-3 cursor-pointer group select-none shrink-0" 
              onClick={() => setActiveTab('calculator')}
              title="回到首頁：產線平衡計算機"
            >
              <div className="relative flex items-center">
                <img
                  src={`${import.meta.env.BASE_URL}assets/snacktorio_logo.png`}
                  alt="Snacktorio"
                  className="h-8 sm:h-10 w-auto object-contain pixelated drop-shadow-[0_2px_10px_rgba(71,161,153,0.35)] group-hover:scale-105 transition-transform duration-200"
                />
              </div>

              <div className="border-l border-[#243943] pl-3 hidden md:flex flex-col justify-center">
                <div className="flex items-center space-x-2">
                  <span className="text-base font-extrabold tracking-wide bg-gradient-to-r from-amber-400 via-orange-300 to-amber-200 bg-clip-text text-transparent">
                    《異食工廠》
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-[#14232a] text-teal-300 border border-teal-500/30">
                    PROD PLANNER
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  全製程自動化產線平衡與物理資料管理系統
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-1">
              <button
                onClick={() => setActiveTab('calculator')}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'calculator'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-md shadow-amber-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#15232b]'
                }`}
              >
                <Calculator className="w-4 h-4 text-amber-400" />
                <span>產線計算機</span>
              </button>

              <button
                onClick={() => setActiveTab('data')}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'data'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-md shadow-amber-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#15232b]'
                }`}
              >
                <Database className="w-4 h-4 text-amber-400" />
                <span className="flex items-center space-x-1.5">
                  <span>資料工作台</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#13222a] text-amber-400 font-mono border border-amber-500/30">
                    {dishesCount}食譜·{machinesCount}機
                  </span>
                </span>
              </button>

              <button
                onClick={() => setActiveTab('sync')}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'sync'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#15232b]'
                }`}
              >
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline">GitHub 同步</span>
              </button>

              {/* Steam Game Link */}
              <a
                href="https://store.steampowered.com/app/1902940/Snacktorio/"
                target="_blank"
                rel="noreferrer"
                className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-amber-300 bg-[#121f26] hover:bg-[#182933] border border-[#223945] transition-all ml-1"
                title="前往 Steam 商店官方遊戲頁面"
              >
                <span>Steam 原作</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
