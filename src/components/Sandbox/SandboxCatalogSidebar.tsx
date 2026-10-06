import React, { useState } from 'react';
import { Plus, Search, Sparkles, Layers, Flame, Pickaxe, GitFork, Hourglass, Droplets, Zap } from 'lucide-react';
import { Machine, Item, IntermediateRecipe, Recipe } from '../../types';
import { isScorchingDish } from '../../services/solver';
import { ItemIcon } from '../Common/ItemIcon';
import { rawSourceMachine, perishableItems } from '../../utils/itemTraits';

export type InfrastructureType = 'generator' | 'pump' | 'environment_pool' | 'splitter' | 'buffer_decay';

interface SandboxCatalogSidebarProps {
  machines: Machine[];
  items: Item[];
  intermediate: IntermediateRecipe[];
  recipes: Recipe[];
  defaultDishRateMin: number;
  setDefaultDishRateMin: (rate: number) => void;
  handleAddMachineWithRecipe: (mach: Machine, recipeOrInter?: IntermediateRecipe | Recipe) => void;
  handleAddItemHarvester: (item: Item) => void;
  handleAddInfrastructure: (type: InfrastructureType, subtype?: string) => void;
}

/** 左側可折疊物資庫 (純資料庫驅動，自適應未來任何新配方)：點擊卡片即放置到畫布 */
export const SandboxCatalogSidebar: React.FC<SandboxCatalogSidebarProps> = ({
  machines,
  items,
  intermediate,
  recipes,
  defaultDishRateMin,
  setDefaultDishRateMin,
  handleAddMachineWithRecipe,
  handleAddItemHarvester,
  handleAddInfrastructure
}) => {
  const [activeCatalogTab, setActiveCatalogTab] = useState<'machines' | 'fluids' | 'items' | 'recipes'>('machines');
  const [itemsFilter, setItemsFilter] = useState<'all' | 'miner' | 'harvester' | 'reconstructor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className={`transition-all duration-300 z-20 flex flex-col border-r border-[#1c2e38] bg-[#0b1419]/95 backdrop-blur-xl ${
      isSidebarOpen ? 'w-80' : 'w-12'
    }`}>
      {/* 頂部切換與搜尋列 */}
      <div className="p-3 border-b border-[#1c2e38] flex items-center justify-between">
        {isSidebarOpen ? (
          <div className="flex-1 flex items-center justify-between space-x-2">
            <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>物資與設備庫</span>
            </span>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="text-xs p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg"
              title="收起選單"
            >
              ◀
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="mx-auto text-xs p-1 text-slate-400 hover:text-slate-200"
            title="展開物資庫"
          >
            ▶
          </button>
        )}
      </div>

      {isSidebarOpen && (
        <>
          {/* 分類標籤切換 */}
          <div className="grid grid-cols-4 border-b border-[#1c2e38] text-[10px] font-bold p-1 bg-slate-950/40 gap-0.5">
            <button 
              onClick={() => setActiveCatalogTab('machines')}
              className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'machines' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              中間工序
            </button>
            <button 
              onClick={() => setActiveCatalogTab('items')}
              className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'items' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              自然採集
            </button>
            <button 
              onClick={() => setActiveCatalogTab('fluids')}
              className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'fluids' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              流體/能源
            </button>
            <button 
              onClick={() => setActiveCatalogTab('recipes')}
              className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'recipes' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              終端食譜
            </button>
          </div>

          {/* 搜尋欄 */}
          <div className="p-2 border-b border-[#1c2e38]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="搜尋設備、配方或原料..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#070e12] border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* 物資列表卡片區 (點擊即放置到畫布) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 text-xs">
            {/* 分頁 1: 機器設備與中間配方 */}
            {activeCatalogTab === 'machines' && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">常用中間工序機台</div>
                {intermediate
                  .filter(r => r.name.includes(searchQuery) || r.machine.includes(searchQuery))
                  .map(r => {
                    const mach = machines.find(m => m.name === r.machine) || { name: r.machine, power: 1.0, goblins: 1 };
                    return (
                      <div
                        key={r.name}
                        onClick={() => handleAddMachineWithRecipe(mach as Machine, r)}
                        className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-amber-500/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <ItemIcon name={r.name} size="sm" />
                          <div className="truncate">
                            <div className="font-bold text-slate-200 truncate group-hover:text-amber-300 transition-colors">
                              {r.name}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center space-x-1">
                              <span>{r.machine}</span>
                              <span>·</span>
                              <span>{r.cycleTime || 5}s/次</span>
                            </div>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0" />
                      </div>
                    );
                  })}
              </div>
            )}

            {/* 分頁 2: 基礎物資、採掘礦產與活體重構 */}
            {activeCatalogTab === 'items' && (() => {
              // 嚴格過濾原生開採物資：一律依 items.json 之 source 欄位判定（純資料庫驅動，新增食材免改程式）
              const isReconItem = (i: Item) => rawSourceMachine(i) === '物質操縱機';
              const isMinerItem = (i: Item) => rawSourceMachine(i) === '採掘機';
              const isHarvestItem = (i: Item) => i.source === '收割機';

              const filteredRawItems = items.filter(i => {
                if (i.isFluid) return false;
                // 防禦性過濾：自動排除地圖地塊與殘留虛擬項目
                if (i.name.includes('植株') || i.name.includes('(礦石方塊)') || i.name.includes('(香料方塊)')) return false;

                // 必須屬於三種合法基礎來源之一
                const matchType = isReconItem(i) || isMinerItem(i) || isHarvestItem(i);
                if (!matchType) return false;

                // 搜尋關鍵字
                const matchQuery = i.name.includes(searchQuery) || (i.source && i.source.includes(searchQuery)) || (i.island && i.island.includes(searchQuery));
                if (!matchQuery) return false;

                // 分類切換過濾
                if (itemsFilter === 'miner') return isMinerItem(i);
                if (itemsFilter === 'harvester') return isHarvestItem(i);
                if (itemsFilter === 'reconstructor') return isReconItem(i);
                return true;
              });

              return (
                <div className="space-y-2">
                  {/* 子分類快速過濾膠囊 */}
                  <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/70 rounded-xl text-[10px] font-bold border border-slate-800">
                    <button
                      onClick={() => setItemsFilter('all')}
                      className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'all' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      全部
                    </button>
                    <button
                      onClick={() => setItemsFilter('miner')}
                      className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'miner' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      ⛏️ 採掘
                    </button>
                    <button
                      onClick={() => setItemsFilter('harvester')}
                      className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'harvester' ? 'bg-green-500/20 text-green-300' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      🌾 收割
                    </button>
                    <button
                      onClick={() => setItemsFilter('reconstructor')}
                      className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'reconstructor' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      🧬 重構
                    </button>
                  </div>

                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider flex items-center justify-between">
                    <span>基礎原料庫 ({filteredRawItems.length})</span>
                    <Pickaxe className="w-3 h-3 text-slate-500" />
                  </div>

                  {filteredRawItems.map(item => {
                    const isRecon = isReconItem(item);
                    const isMine = isMinerItem(item);

                    let badgeText = '收割機';
                    let badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                    let descText = '0.20/s · 自主採收';

                    if (isRecon) {
                      badgeText = '物質操縱機';
                      badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                      descText = item.name === '虛空汙泥'
                        ? '0.20/s · 空載凝結 (僅需虛空 1.0 fl/s)'
                        : (item.name === '泥沼蟑螂' ? '0.40/s · 吃底料+虛空' : '0.20/s · 吃底料+虛空');
                    } else if (isMine) {
                      badgeText = '採掘機';
                      badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                      descText = '0.20/s · 自主開採';
                    }

                    return (
                      <div
                        key={item.name}
                        onClick={() => handleAddItemHarvester(item)}
                        className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-emerald-500/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <ItemIcon name={item.name} size="sm" />
                          <div className="truncate">
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="font-bold text-slate-200 truncate group-hover:text-emerald-300 transition-colors">
                                {item.name}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border shrink-0 ${badgeClass}`}>
                                {badgeText}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                              <span>{descText}</span>
                              {item.island && (
                                <>
                                  <span>·</span>
                                  <span>{item.island}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* 分頁 3: 流體環境池、外採泵機與電網 */}
            {activeCatalogTab === 'fluids' && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">⚡ 電網基礎設施</div>
                <div 
                  onClick={() => handleAddInfrastructure('generator', 'regular')}
                  className="p-2 rounded-xl bg-[#14180e] hover:bg-[#1c2214] border border-amber-900/40 hover:border-amber-500/50 cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-amber-300">虛空熔爐 (常規)</div>
                      <div className="text-[10px] text-slate-400">發電 4.0 FV/s · 吃煤炭 0.1/s</div>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                </div>

                <div 
                  onClick={() => handleAddInfrastructure('generator', 'overclock')}
                  className="p-2 rounded-xl bg-[#14180e] hover:bg-[#1c2214] border border-amber-900/40 hover:border-amber-500/50 cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-amber-300" />
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-amber-300">虛空熔爐 (超頻)</div>
                      <div className="text-[10px] text-slate-400">發電 16.0 FV/s · 煤+汙泥 0.1/s</div>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                </div>

                <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">💧 抽取泵機站 (投入虛空汙泥自動超頻)</div>
                {['水', '油', '虛空'].map(fluid => (
                  <div 
                    key={fluid}
                    onClick={() => handleAddInfrastructure('pump', fluid)}
                    className="p-2 rounded-xl bg-[#0e161c] hover:bg-[#132029] border border-cyan-900/40 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <Droplets className="w-4 h-4 text-cyan-400" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-cyan-300">{fluid}抽取泵機</div>
                        <div className="text-[10px] text-slate-400">常規 2.0 fl/s · 供汙泥超頻 8.0 fl/s</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                  </div>
                ))}

                <div 
                  onClick={() => handleAddInfrastructure('pump', 'generic')}
                  className="p-2 rounded-xl bg-[#140e1c] hover:bg-[#1f142b] border border-purple-900/40 hover:border-purple-500/50 cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2">
                    <Droplets className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-purple-300">通用抽取泵機 (無指定液體)</div>
                      <div className="text-[10px] text-slate-400">接注入機或環境池 · 常規 2.0 / 超頻 8.0 fl/s</div>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-slate-500 group-hover:text-purple-400" />
                </div>

                <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">🏞️ 環境池節點 (注入機原位轉化)</div>
                {['油池', '水池', '虛空裂隙'].map(pool => (
                  <div 
                    key={pool}
                    onClick={() => handleAddInfrastructure('environment_pool', pool)}
                    className="p-2 rounded-xl bg-[#091517] hover:bg-[#0f1f22] border border-teal-900/40 hover:border-teal-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <Droplets className="w-4 h-4 text-teal-400" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-teal-300">{pool}</div>
                        <div className="text-[10px] text-slate-400">環境底料，支援原位轉化</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-teal-400" />
                  </div>
                ))}
                <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">🔀 物流分流與時序發酵</div>
                <div 
                  onClick={() => handleAddInfrastructure('splitter')}
                  className="p-2 rounded-xl bg-[#0e1724] hover:bg-[#152336] border border-blue-900/40 hover:border-blue-500/50 cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2">
                    <GitFork className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-blue-300">物品分流器 (1進2出)</div>
                      <div className="text-[10px] text-slate-400">固體傳送帶 1:1 均分 · 即時分流</div>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
                </div>

                <div 
                  onClick={() => handleAddInfrastructure('buffer_decay')}
                  className="p-2 rounded-xl bg-[#0c1a14] hover:bg-[#12261d] border border-emerald-900/40 hover:border-emerald-500/50 cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2">
                    <Hourglass className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-emerald-300">發酵變質緩衝方塊 (自選)</div>
                      <div className="text-[10px] text-slate-400">時序輸送帶發酵 · 依原料自動轉化</div>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
                </div>

                {/* 時序發酵/變質快捷項：由 items.json 之 isPerishable + spoilProduct 動態生成 */}
                {perishableItems(items).map(it => ({
                  name: it.name,
                  prod: it.spoilProduct as string,
                  time: Number(it.spoilTime) || 15
                })).map(ferment => (
                  <div 
                    key={ferment.name}
                    onClick={() => handleAddInfrastructure('buffer_decay', ferment.name)}
                    className="p-2 rounded-xl bg-[#091512] hover:bg-[#0e211d] border border-emerald-950/60 hover:border-emerald-500/40 cursor-pointer flex items-center justify-between group pl-4"
                  >
                    <div className="flex items-center space-x-2">
                      <ItemIcon name={ferment.prod} size="sm" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-emerald-300 text-[11px]">
                          {ferment.name} ➔ {ferment.prod}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          發酵 {ferment.time}s · 傳送帶 ≥ {ferment.time} 格
                        </div>
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                  </div>
                ))}
              </div>
            )}

            {/* 分頁 3: 終端料理自動廚師機 */}
            {activeCatalogTab === 'recipes' && (
              <div className="space-y-3">
                {/* 全域料理出餐目標設定 */}
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-900/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-300 flex items-center space-x-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>預設料理出餐目標</span>
                    </span>
                    <span className="font-mono text-slate-300 font-bold">
                      {defaultDishRateMin} 份/分
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    {[12, 24, 36].map(rate => (
                      <button
                        key={rate}
                        onClick={() => setDefaultDishRateMin(rate)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-colors ${
                          defaultDishRateMin === rate
                            ? 'bg-amber-500/30 text-amber-300 font-bold border border-amber-500/50'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                        title={`設定預設出餐目標為 ${rate} 份/分 (${(rate / 12).toFixed(1)} 台廚師機需求)`}
                      >
                        {rate} 份/分
                      </button>
                    ))}
                    <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 w-20">
                      <input
                        type="number"
                        min="1"
                        value={defaultDishRateMin}
                        onChange={(e) => setDefaultDishRateMin(Math.max(1, Number(e.target.value) || 12))}
                        className="w-full bg-transparent text-[10px] font-mono text-amber-200 outline-none text-center"
                        title="自訂出餐目標"
                      />
                      <span className="text-[9px] text-slate-500 ml-0.5">/分</span>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-500">
                    💡 放置料理時直接以此產能為基準；若為熾熱料理將自動連動【胃復慘】。
                  </div>
                </div>

                <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider flex items-center justify-between">
                  <span>終端組裝料理 ({recipes.filter(r => r.name.includes(searchQuery)).length})</span>
                  <Sparkles className="w-3 h-3 text-amber-400" />
                </div>
                {recipes
                  .filter(r => r.name.includes(searchQuery))
                  .map(r => {
                    const mach = machines.find(m => m.name === '自動廚師機') || { name: '自動廚師機', power: 1.0, goblins: 3 };
                    const isScorching = isScorchingDish(r.name, items, recipes);
                    return (
                      <div
                        key={r.name}
                        onClick={() => handleAddMachineWithRecipe(mach as Machine, r)}
                        className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-amber-500/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <ItemIcon name="自動廚師機" size="sm" />
                          <div className="truncate">
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="font-bold text-slate-200 truncate group-hover:text-amber-300 transition-colors">
                                {r.name}
                              </span>
                              {isScorching && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold shrink-0" title="熾熱菜餚：點擊將自動配對【胃復慘】">
                                  🌶️ 熾熱
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                              <span>出餐 {defaultDishRateMin} 份/分</span>
                              {r.island && (
                                <>
                                  <span>·</span>
                                  <span>{r.island}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0" />
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
