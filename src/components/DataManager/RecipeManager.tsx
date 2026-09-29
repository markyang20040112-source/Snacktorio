import React, { useState, useMemo } from 'react';
import { Recipe, Item, IntermediateRecipe } from '../../types';
import { SearchableSelect, SelectOptionGroup } from '../Common/SearchableSelect';
import { Plus, Edit2, Trash2, Search, X, Check } from 'lucide-react';
import { ItemIcon } from '../Common/ItemIcon';

interface RecipeManagerProps {
  recipes: Recipe[];
  items: Item[];
  intermediate: IntermediateRecipe[];
  onSave: (recipes: Recipe[]) => void;
}

export const RecipeManager: React.FC<RecipeManagerProps> = ({
  recipes,
  items,
  intermediate,
  onSave
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [islandFilter, setIslandFilter] = useState('ALL');
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Custom input states for Island and Fluid
  const [isCustomIsland, setIsCustomIsland] = useState(false);
  const [customIslandInput, setCustomIslandInput] = useState('');
  const [isCustomFluid, setIsCustomFluid] = useState(false);
  const [customFluidInput, setCustomFluidInput] = useState('');

  // 1. Dynamic list of islands from all recipes and items
  const dynamicIslands = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach(r => { if (r.island) set.add(r.island.trim()); });
    items.forEach(it => { if (it.island && it.island !== '常規物資') set.add(it.island.trim()); });
    return Array.from(set);
  }, [recipes, items]);
  const islands = dynamicIslands;

  // 2. Dynamic solid ingredients list: Intermediate recipe outputs + Clean non-duplicate base items
  const solidOptions = useMemo(() => {
    // Non-culinary machines and industrial items
    const nonCulinaryMachines = new Set(['裝配機']);
    const nonCulinaryNames = new Set(['鐵', '玻璃', '煤炭', '鐵礦石', '沙塊', '橡膠', '黏土', '灰燼', '粉塵', '黏土石']);
    // Sauces are dedicated to the fluid dropdown; exclude from solid ingredients (except 醋 which is used in pickled food)
    const pureSauceFluids = new Set(['塔瑪茄醬', '青醬', '白醬', '肉汁', '麵糊', '炙烈紅油', '蟑螂奶']);

    // A. Intermediate products (deduplicated by product name)
    const interSet = new Set<string>();
    const intermediateList: { name: string; machine: string }[] = [];

    intermediate.forEach(r => {
      const name = r.name?.trim();
      const m = r.machine?.trim() || '';
      if (!name || interSet.has(name)) return;
      if (nonCulinaryMachines.has(m) || nonCulinaryNames.has(name) || pureSauceFluids.has(name)) return;

      interSet.add(name);
      intermediateList.push({ name, machine: m || '中間配方' });
    });
    intermediateList.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

    // B. Base raw / harvested / decay food items from items.json
    // Strictly filter out:
    // - items already present in intermediateList (prevents duplication)
    // - terminal dishes (source === '自動廚師機' or present in recipes.json)
    // - factory logistics / building items / tools (source in nonFoodSources)
    // - pure piped fluids ('水', '油', '虛空')
    // - map blocks and plant tiles ('方塊', '植株', '草地', '石頭', '樹', '叢', '塊莖', '砂岩', '冰塊', '礦脈')
    const nonFoodSources = new Set(['裝配機', '開局獲得', '創造模式開局獲得', '無法取得', '自動廚師機']);
    const terrainKeywords = ['方塊', '植株', '草地', '石頭', '樹', '叢', '塊莖', '砂岩', '冰塊', '礦脈'];
    const pureFluids = new Set(['水', '油', '虛空']);
    const recipeNames = new Set(recipes.map(r => r.name?.trim()));

    const baseItemSet = new Set<string>();
    const baseItemsList: { name: string; source: string; island?: string }[] = [];

    items.forEach(it => {
      const name = it.name?.trim();
      const source = it.source?.trim() || '';
      if (!name) return;
      if (interSet.has(name) || pureSauceFluids.has(name) || nonCulinaryNames.has(name)) return;
      if (recipeNames.has(name) || nonFoodSources.has(source)) return;
      if (pureFluids.has(name) || it.isFluid) return;
      if (terrainKeywords.some(k => name.includes(k))) return;
      if (baseItemSet.has(name)) return;

      baseItemSet.add(name);
      baseItemsList.push({ name, source: source || '採集/生成', island: it.island });
    });
    baseItemsList.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

    return {
      intermediate: intermediateList,
      items: baseItemsList
    };
  }, [intermediate, items, recipes]);

  // 3. Dynamic fluid list: Base fluids (水, 油, 虛空) + Sauces (攪拌機, 注入機, 甘酒, 蒜泥蛋醬) + other recipe fluids
  const fluidOptions = useMemo(() => {
    const baseFluids = ['水', '油', '虛空'];
    const fluidSet = new Set<string>(baseFluids);

    // Liquid-producing machines in Snacktorio (攪拌機, 注入機) or known liquids
    const sauceMachines = new Set(['攪拌機', '注入機']);
    const knownLiquids = new Set(['甘酒', '蒜泥蛋醬', '醋']);

    const sauces: string[] = [];

    // Check items explicitly marked as fluid
    items.forEach(it => {
      const name = it.name?.trim();
      if (!name || fluidSet.has(name)) return;
      if (it.isFluid) {
        fluidSet.add(name);
        sauces.push(name);
      }
    });

    // Check intermediate recipe products
    intermediate.forEach(r => {
      const name = r.name?.trim();
      if (!name || fluidSet.has(name)) return;
      if (sauceMachines.has(r.machine) || knownLiquids.has(name)) {
        fluidSet.add(name);
        sauces.push(name);
      }
    });

    // Also check fluids consumed by intermediate recipes (e.g. 蟑螂奶)
    intermediate.forEach(r => {
      const ft = r.fluidType?.trim();
      if (ft && ft !== '無' && !fluidSet.has(ft)) {
        fluidSet.add(ft);
        sauces.push(ft);
      }
    });

    sauces.sort((a, b) => a.localeCompare(b, 'zh-Hant'));

    // Other fluids actually used in recipes.json
    const otherFluids: string[] = [];
    recipes.forEach(r => {
      const ft = r.fluidType?.trim();
      if (ft && ft !== '無' && !fluidSet.has(ft)) {
        fluidSet.add(ft);
        otherFluids.push(ft);
      }
    });
    otherFluids.sort((a, b) => a.localeCompare(b, 'zh-Hant'));

    return {
      baseFluids,
      sauces,
      otherFluids
    };
  }, [intermediate, recipes]);

  // Memoized select groups for SearchableSelect
  const solidSelectGroups = useMemo<SelectOptionGroup[]>(() => {
    const groups: SelectOptionGroup[] = [];
    if (solidOptions.intermediate.length > 0) {
      groups.push({
        label: '⚙️ 中間配方產物 (半成品)',
        options: solidOptions.intermediate.map(r => ({
          value: r.name,
          label: `${r.name} (${r.machine})`,
          sublabel: r.machine
        }))
      });
    }
    if (solidOptions.items.length > 0) {
      groups.push({
        label: '🥗 基礎食材與採集品',
        options: solidOptions.items.map(it => ({
          value: it.name,
          label: `${it.name} (${it.source})`,
          sublabel: it.source
        }))
      });
    }
    return groups;
  }, [solidOptions]);

  const fluidSelectGroups = useMemo<SelectOptionGroup[]>(() => {
    const groups: SelectOptionGroup[] = [
      {
        options: [
          { value: '無', label: '無 (不需持續液體)' }
        ]
      }
    ];

    if (fluidOptions.baseFluids.length > 0) {
      groups.push({
        label: '💧 基礎流體原料',
        options: fluidOptions.baseFluids.map(f => ({ value: f, label: f }))
      });
    }

    if (fluidOptions.sauces.length > 0) {
      groups.push({
        label: '🥣 調配醬汁與加工流體 (中間配方)',
        options: fluidOptions.sauces.map(f => ({ value: f, label: f }))
      });
    }

    if (fluidOptions.otherFluids.length > 0) {
      groups.push({
        label: '✨ 其他已登錄料理流體',
        options: fluidOptions.otherFluids.map(f => ({ value: f, label: f }))
      });
    }

    groups.push({
      options: [
        { value: '__CUSTOM__', label: '➕ 新增自訂流體/醬汁...' }
      ]
    });

    return groups;
  }, [fluidOptions]);

  const filtered = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.inputs.some(inp => inp.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (r.fluidType || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIsland = islandFilter === 'ALL' || r.island === islandFilter;
    return matchesSearch && matchesIsland;
  });

  const handleEdit = (r: Recipe) => {
    const recipeCopy: Recipe = JSON.parse(JSON.stringify(r));
    // Filter out empty or '無' inputs so the modal only shows real ingredient rows
    const cleanedInputs = (recipeCopy.inputs || []).filter(inp => inp.name && inp.name.trim() !== '' && inp.name !== '無');
    const defaultItem = solidOptions.intermediate[0]?.name || solidOptions.items[0]?.name || '';
    recipeCopy.inputs = cleanedInputs.length > 0 ? cleanedInputs : [{ name: defaultItem, count: 1 }];
    setEditingRecipe(recipeCopy);
    setIsNew(false);

    if (r.island && !dynamicIslands.includes(r.island.trim())) {
      setIsCustomIsland(true);
      setCustomIslandInput(r.island);
    } else {
      setIsCustomIsland(false);
      setCustomIslandInput('');
    }

    const allKnownFluids = ['無', ...fluidOptions.baseFluids, ...fluidOptions.sauces, ...fluidOptions.otherFluids];
    if (r.fluidType && r.fluidType !== '無' && !allKnownFluids.includes(r.fluidType.trim())) {
      setIsCustomFluid(true);
      setCustomFluidInput(r.fluidType);
    } else {
      setIsCustomFluid(false);
      setCustomFluidInput('');
    }
  };

  const handleCreate = () => {
    const defaultIsland = dynamicIslands[0] || '波莫拉 (Pomora)';
    const defaultItem = solidOptions.intermediate[0]?.name || solidOptions.items[0]?.name || '';
    setEditingRecipe({
      island: defaultIsland,
      name: '',
      machine: '自動廚師機',
      fluidType: '無',
      fluidRate: 0.0,
      inputs: [{ name: defaultItem, count: 1 }],
      cycleTime: 5,
      outputCount: 1,
      notes: ''
    });
    setIsNew(true);
    setIsCustomIsland(false);
    setCustomIslandInput('');
    setIsCustomFluid(false);
    setCustomFluidInput('');
  };

  const handleDelete = (name: string) => {
    if (confirm(`確定要刪除料理「${name}」嗎？`)) {
      onSave(recipes.filter(r => r.name !== name));
    }
  };

  const addInputRow = () => {
    if (!editingRecipe || editingRecipe.inputs.length >= 4) return;
    const defaultItem = solidOptions.intermediate[0]?.name || solidOptions.items[0]?.name || '';
    setEditingRecipe({
      ...editingRecipe,
      inputs: [...editingRecipe.inputs, { name: defaultItem, count: 1 }]
    });
  };

  const removeInputRow = (idx: number) => {
    if (!editingRecipe) return;
    setEditingRecipe({
      ...editingRecipe,
      inputs: editingRecipe.inputs.filter((_, i) => i !== idx)
    });
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipe || !editingRecipe.name.trim()) return;

    const finalIsland = isCustomIsland ? customIslandInput.trim() : (editingRecipe.island || '').trim();
    if (!finalIsland) {
      alert('請選擇或填寫所屬島嶼！');
      return;
    }

    let finalFluid = editingRecipe.fluidType;
    if (isCustomFluid) {
      finalFluid = customFluidInput.trim() || '無';
    }

    const finalRate = (finalFluid && finalFluid !== '無') ? 1.0 : 0.0;

    // Pad inputs to 4 slots with { name: '無', count: 0 } to preserve exact recipe schema
    const cleanInputs = editingRecipe.inputs.filter(inp => inp.name && inp.name.trim() !== '' && inp.name !== '無');
    while (cleanInputs.length < 4) {
      cleanInputs.push({ name: '無', count: 0 });
    }

    const toSave: Recipe = {
      ...editingRecipe,
      name: editingRecipe.name.trim(),
      island: finalIsland,
      fluidType: finalFluid,
      fluidRate: finalRate,
      inputs: cleanInputs
    };

    if (isNew) {
      if (recipes.some(r => r.name === toSave.name)) {
        alert('已有相同名稱之終端料理！');
        return;
      }
      onSave([...recipes, toSave]);
    } else {
      onSave(recipes.map(r => r.name === toSave.name ? toSave : r));
    }
    setEditingRecipe(null);
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex flex-1 items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋料理名稱、原料或醬汁..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <select
            value={islandFilter}
            onChange={(e) => setIslandFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="ALL">全部島嶼分類 ({recipes.length})</option>
            {islands.map(isl => (
              <option key={isl} value={isl}>{isl}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCreate}
          className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-sm font-bold transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>新增終端料理食譜</span>
        </button>
      </div>

      {/* Recipes Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-xs shadow-sm">
                <th className="py-3 px-4 whitespace-nowrap">所屬島嶼</th>
                <th className="py-3 px-4 whitespace-nowrap">料理名稱</th>
                <th className="py-3 px-4 whitespace-nowrap">固體食材清單 (1:1 配比)</th>
                <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">持續組裝流體</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">出餐基準速率</th>
                <th className="py-3 px-4">注意事項</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                    {r.island}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-100 whitespace-nowrap">
                    {r.name}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {r.inputs.map((inp, iIdx) => (
                        <span key={iIdx} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-200 whitespace-nowrap inline-flex items-center space-x-1">
                          <ItemIcon name={inp.name} size="xs" showBorder={false} />
                          <span>{inp.name}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono whitespace-nowrap">
                    {r.fluidType !== '無' ? (
                      <span className="text-cyan-300 font-bold whitespace-nowrap inline-flex items-center space-x-1.5">
                        <ItemIcon name={r.fluidType} size="xs" showBorder={false} />
                        <span>{r.fluidType}</span>
                        <span className="text-cyan-400 font-normal">({r.fluidRate || 1.0} fl/s)</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 whitespace-nowrap">無流體</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-300 font-bold whitespace-nowrap">
                    {Math.round(((r.outputCount || 1) * 60) / (r.cycleTime || 5))} <span className="text-[10px] text-slate-400">份/分</span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate" title={r.notes}>
                    {r.notes || '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleEdit(r)}
                        className="text-slate-400 hover:text-amber-400 p-1 transition-colors"
                        title="編輯"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.name)}
                        className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      {editingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full shadow-2xl relative flex flex-col max-h-[90vh] my-auto overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <span>{isNew ? '🍲 新增終端料理食譜' : `✏️ 編輯料理：${editingRecipe.name}`}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecipe(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex flex-col flex-1 min-h-0 overflow-hidden text-sm">
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">料理名稱</label>
                  <input
                    type="text"
                    required
                    value={editingRecipe.name}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                    disabled={!isNew}
                    placeholder="如：哀嚎肉丸、炙烈紅燴飯..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">所屬島嶼</label>
                  <select
                    value={isCustomIsland ? '__CUSTOM__' : editingRecipe.island}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomIsland(true);
                        setCustomIslandInput('');
                      } else {
                        setIsCustomIsland(false);
                        setEditingRecipe({ ...editingRecipe, island: e.target.value });
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                  >
                    {dynamicIslands.map(isl => (
                      <option key={isl} value={isl}>🏝️ {isl}</option>
                    ))}
                    <option value="__CUSTOM__">➕ 新增自訂島嶼...</option>
                  </select>
                  {isCustomIsland && (
                    <input
                      type="text"
                      required
                      placeholder="請輸入新島嶼名稱，如：新島嶼 (New Island)..."
                      value={customIslandInput}
                      onChange={(e) => {
                        setCustomIslandInput(e.target.value);
                        setEditingRecipe({ ...editingRecipe, island: e.target.value });
                      }}
                      className="mt-2 w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-1.5 text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  )}
                </div>
              </div>

              {/* Output Rate & Cycle Time Specs */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">組裝週期 (秒)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editingRecipe.cycleTime || 5}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, cycleTime: parseInt(e.target.value) || 5 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">單次組裝產出 (份)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editingRecipe.outputCount || 1}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, outputCount: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">基準出餐速率</label>
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-300 flex items-center justify-between">
                    <span>{Math.round(((editingRecipe.outputCount || 1) * 60) / (editingRecipe.cycleTime || 5))} 份/分</span>
                    <span className="text-[10px] text-slate-500 font-normal">({(((editingRecipe.outputCount || 1)) / (editingRecipe.cycleTime || 5)).toFixed(2)} 份/秒)</span>
                  </div>
                </div>
              </div>

              {/* Solid Ingredients (1:1:1:1 boundary) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-300">
                      固體食材清單 (組裝配比恆為 1:1，最多 4 種)
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      自動廚師機組裝極限：最多 4 種固體原料，每項固定各消耗 1 個。
                    </p>
                  </div>
                  {editingRecipe.inputs.length < 4 && (
                    <button
                      type="button"
                      onClick={addInputRow}
                      className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                    >
                      + 新增食材
                    </button>
                  )}
                </div>

                {editingRecipe.inputs.map((inp, idx) => {
                  const isInList = solidOptions.intermediate.some(r => r.name === inp.name) ||
                                   solidOptions.items.some(it => it.name === inp.name);
                  const rowGroups = (!isInList && inp.name)
                    ? [
                        ...solidSelectGroups,
                        {
                          label: '✨ 當前食譜食材',
                          options: [{ value: inp.name, label: inp.name }]
                        }
                      ]
                    : solidSelectGroups;

                  return (
                    <div key={idx} className="flex items-center space-x-2 relative" style={{ zIndex: 40 - idx }}>
                      <span className="text-xs text-slate-500 font-mono w-4 shrink-0">#{idx+1}</span>
                      <SearchableSelect
                        groups={rowGroups}
                        value={inp.name}
                        onChange={(val) => {
                          const newInputs = [...editingRecipe.inputs];
                          newInputs[idx].name = val;
                          setEditingRecipe({ ...editingRecipe, inputs: newInputs });
                        }}
                        placeholder="請選擇食材..."
                        size="xs"
                        className="flex-1"
                      />

                      <span className="text-xs font-mono text-slate-400 px-2 py-1 bg-slate-900 rounded border border-slate-800 shrink-0">
                        固定 1 個
                      </span>

                      {editingRecipe.inputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInputRow(idx)}
                          className="text-slate-500 hover:text-red-400 p-1 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Fluid Input (Max 1 fluid, 1.0 fl/s) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    終端組裝持續液體 (最多 1 種，固定 1.0 fl/s)
                  </span>
                  <span className="text-[11px] text-cyan-400 font-mono">
                    {editingRecipe.fluidType && editingRecipe.fluidType !== '無' ? '持續通液：1.0 fl/s' : '無持續液體'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative z-20">
                    <label className="block text-[11px] text-slate-400 mb-1">醬汁/液體種類</label>
                    <SearchableSelect
                      groups={fluidSelectGroups}
                      value={isCustomFluid ? '__CUSTOM__' : (editingRecipe.fluidType || '無')}
                      onChange={(val) => {
                        if (val === '__CUSTOM__') {
                          setIsCustomFluid(true);
                          setCustomFluidInput('');
                          setEditingRecipe({
                            ...editingRecipe,
                            fluidType: '',
                            fluidRate: 1.0
                          });
                        } else {
                          setIsCustomFluid(false);
                          setEditingRecipe({
                            ...editingRecipe,
                            fluidType: val,
                            fluidRate: val !== '無' ? 1.0 : 0.0
                          });
                        }
                      }}
                      placeholder="請選擇流體或醬汁..."
                      size="xs"
                      className="w-full"
                    />
                    {isCustomFluid && (
                      <input
                        type="text"
                        required
                        placeholder="請輸入新流體名稱，如：自製醬汁..."
                        value={customFluidInput}
                        onChange={(e) => {
                          setCustomFluidInput(e.target.value);
                          setEditingRecipe({
                            ...editingRecipe,
                            fluidType: e.target.value,
                            fluidRate: 1.0
                          });
                        }}
                        className="mt-2 w-full bg-slate-900 border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">組裝流率 (fl/s)</label>
                    <div className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono flex items-center justify-between text-slate-300">
                      <span className={`font-bold ${editingRecipe.fluidType && editingRecipe.fluidType !== '無' ? 'text-cyan-300' : 'text-slate-500'}`}>
                        {editingRecipe.fluidType && editingRecipe.fluidType !== '無' ? '1.0 fl/s' : '0.0 fl/s'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {editingRecipe.fluidType && editingRecipe.fluidType !== '無' ? '固定配比' : '無需流體'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">特殊製程注意事項</label>
                <textarea
                  rows={2}
                  placeholder="怪獸忌辣、防凝固、獨立專線等..."
                  value={editingRecipe.notes || ''}
                  onChange={(e) => setEditingRecipe({ ...editingRecipe, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              </div>

              {/* Fixed Modal Footer */}
              <div className="px-6 py-3.5 bg-slate-950/90 border-t border-slate-800 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingRecipe(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all text-xs sm:text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all text-xs sm:text-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>儲存食譜</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
