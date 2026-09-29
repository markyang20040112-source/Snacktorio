import React, { useState, useMemo } from 'react';
import { Item } from '../../types';
import { Plus, Edit2, Trash2, Search, X, Check, Droplet, Box } from 'lucide-react';
import { SearchableSelect, SelectOptionGroup } from '../Common/SearchableSelect';
import { ItemIcon } from '../Common/ItemIcon';
import { IconUploader } from '../Common/IconUploader';

interface ItemManagerProps {
  items: Item[];
  onSave: (items: Item[]) => void;
}

const COMMON_TAGS = ['過敏原', '遇熱凝固', '氣味刺鼻', '中毒', '發酵膨脹', '虛空底料'];

const DEFAULT_ISLANDS = [
  '常規物資',
  '波莫拉 (Pomora)',
  '克羅維納 (Clovina)',
  '炙熱荒漠 (Karisma)',
  '幽靈群島 (Umbril)',
  '霜凍苔原 (Glacio)'
];

/**
 * Determine if an item is a fluid based on explicit isFluid property or known Snacktorio physics
 */
export const isItemFluid = (it: Item): boolean => {
  if (typeof it.isFluid === 'boolean') return it.isFluid;
  const name = it.name?.trim() || '';
  const source = it.source?.trim() || '';
  if (['水', '油', '虛空', '蟑螂奶', '炙烈紅油', '甘酒', '蒜泥蛋醬', '醋'].includes(name)) return true;
  if (['攪拌機', '注入機', '虛空泵機'].includes(source)) return true;
  return false;
};

export const ItemManager: React.FC<ItemManagerProps> = ({ items, onSave }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [islandFilter, setIslandFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'solid' | 'liquid'>('ALL');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Island selection & custom creation state
  const [isCustomIsland, setIsCustomIsland] = useState(false);
  const [customIslandInput, setCustomIslandInput] = useState('');

  // Source selection & custom creation state
  const [isCustomSource, setIsCustomSource] = useState(false);
  const [customSourceInput, setCustomSourceInput] = useState('');

  // Dynamic island options from defaults + existing items
  const dynamicIslands = useMemo(() => {
    const set = new Set<string>(DEFAULT_ISLANDS);
    items.forEach(it => {
      if (it.island?.trim()) set.add(it.island.trim());
    });
    return Array.from(set);
  }, [items]);

  // Grouped options for SearchableSelect: Machines and Natural sources
  const sourceGroups = useMemo<SelectOptionGroup[]>(() => {
    const machineOptions = [
      { value: '收割機', label: '收割機 (植物無限採收)', badge: '📦 固體' },
      { value: '採掘機', label: '採掘機 (礦物無限開採)', badge: '📦 固體' },
      { value: '虛空泵機', label: '虛空泵機 (流體無限抽取)', badge: '💧 液體' },
      { value: '攪拌機', label: '攪拌機 (食材攪拌醬汁)', badge: '💧 液體' },
      { value: '注入機', label: '注入機 (環境原位轉化)', badge: '💧 液體' },
      { value: '發酵罐', label: '發酵罐 (時序發酵轉化)', badge: '📦 固體' },
      { value: '混合機', label: '混合機 (多食材混合加工)', badge: '📦 固體' },
      { value: '研磨機', label: '研磨機 (磨碎粉末)', badge: '📦 固體' },
      { value: '油炸鍋', label: '油炸鍋 (通油油炸熟化)', badge: '📦 固體' },
      { value: '煮鍋', label: '煮鍋 (通水水煮熟化)', badge: '📦 固體' },
      { value: '烤箱', label: '烤箱 (烘焙與高溫冶煉)', badge: '📦 固體' },
      { value: '擠出機', label: '擠出機 (固體成型擠出)', badge: '📦 固體' },
      { value: '物質操縱機', label: '物質操縱機 (通虛空重構)', badge: '📦 固體' },
      { value: '裝配機', label: '裝配機 (工業基建物資)', badge: '📦 固體' },
      { value: '自動廚師機', label: '自動廚師機 (料理組裝出餐)', badge: '📦 固體' },
    ];

    const naturalOptions = [
      { value: '地圖生成', label: '地圖生成 (自然地貌/野生採集)' },
      { value: '開局獲得', label: '開局獲得 (初始新手物資)' },
      { value: '蛇蛋腐壞', label: '蛇蛋腐壞 (時序自然腐壞)' },
      { value: '麵包麵糰發酵', label: '麵包麵糰發酵 (時序自然發酵)' },
      { value: '蟑螂奶油發酵', label: '蟑螂奶油發酵 (常溫熟成)' },
      { value: '軟質奶酪發酵', label: '軟質奶酪發酵 (時序熟成)' },
      { value: '中等熟成奶酪發酵', label: '中等熟成奶酪發酵 (時序熟成)' },
      { value: '硬質奶酪發酵', label: '硬質奶酪發酵 (時序熟成)' },
      { value: '角色死亡', label: '角色死亡 (特殊墓碑掉落)' },
      { value: '無法取得', label: '無法取得 (展示/無效物品)' },
    ];

    const knownVals = new Set([...machineOptions.map(m => m.value), ...naturalOptions.map(n => n.value)]);
    const customExisting = Array.from(new Set(items.map(it => it.source?.trim()).filter(Boolean)))
      .filter(s => !knownVals.has(s))
      .map(s => ({ value: s, label: s }));

    const groups: SelectOptionGroup[] = [
      {
        label: '⚙️ 生產與採集設備 (選取自動設定型態)',
        options: machineOptions
      },
      {
        label: '🌍 自然採集與時序熟成',
        options: naturalOptions
      }
    ];

    if (customExisting.length > 0) {
      groups.push({
        label: '✨ 其他既有途徑',
        options: customExisting
      });
    }

    groups.push({
      label: '✏️ 其他自訂',
      options: [{ value: '__CUSTOM__', label: '➕ 自訂其他途徑/設備...' }]
    });

    return groups;
  }, [items]);

  const filtered = items.filter(it => {
    const isFluid = isItemFluid(it);
    const matchesSearch = it.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          it.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (it.attributes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIsland = islandFilter === 'ALL' || it.island === islandFilter;
    const matchesType = typeFilter === 'ALL' || 
                        (typeFilter === 'liquid' && isFluid) || 
                        (typeFilter === 'solid' && !isFluid);
    return matchesSearch && matchesIsland && matchesType;
  });

  const handleEdit = (it: Item) => {
    const isFluid = isItemFluid(it);
    setEditingItem({ ...it, isFluid });

    const isKnownIsland = dynamicIslands.includes(it.island);
    setIsCustomIsland(!isKnownIsland);
    setCustomIslandInput(isKnownIsland ? '' : it.island);

    const flatKnown = sourceGroups.flatMap(g => g.options.map(o => o.value)).filter(v => v !== '__CUSTOM__');
    const isKnownSource = flatKnown.includes(it.source);
    setIsCustomSource(!isKnownSource);
    setCustomSourceInput(isKnownSource ? '' : it.source);

    setIsNew(false);
  };

  const handleCreate = () => {
    setEditingItem({
      island: dynamicIslands[0] || '常規物資',
      name: '',
      source: '收割機',
      isFluid: false,
      isPerishable: false,
      spoilTime: null,
      spoilProduct: '',
      attributes: '',
      notes: '',
      icon: undefined
    });
    setIsCustomIsland(false);
    setCustomIslandInput('');
    setIsCustomSource(false);
    setCustomSourceInput('');
    setIsNew(true);
  };

  const handleDelete = (name: string) => {
    if (confirm(`確定要刪除食材/物品「${name}」嗎？`)) {
      onSave(items.filter(it => it.name !== name));
    }
  };

  const handleSourceSelect = (selectedSource: string) => {
    if (!editingItem) return;

    if (selectedSource === '__CUSTOM__') {
      setIsCustomSource(true);
      setCustomSourceInput('');
      setEditingItem({ ...editingItem, source: '' });
      return;
    }

    setIsCustomSource(false);

    // Auto-detect liquid or solid based on machine/source!
    let autoFluid = editingItem.isFluid;
    if (['攪拌機', '注入機', '虛空泵機'].includes(selectedSource)) {
      autoFluid = true;
    } else if ([
      '收割機', '採掘機', '油炸鍋', '煮鍋', '烤箱',
      '擠出機', '研磨機', '物質操縱機', '裝配機', '自動廚師機',
      '混合機', '發酵罐'
    ].includes(selectedSource)) {
      autoFluid = false;
    }

    setEditingItem({
      ...editingItem,
      source: selectedSource,
      isFluid: autoFluid
    });
  };

  const toggleAttribute = (tag: string) => {
    if (!editingItem) return;
    const current = (editingItem.attributes || '').split(/[,/， ]/).map(s => s.trim()).filter(Boolean);
    const has = current.includes(tag);
    const updated = has ? current.filter(t => t !== tag) : [...current, tag];
    setEditingItem({ ...editingItem, attributes: updated.join('/') });
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name.trim()) return;

    const finalIsland = (isCustomIsland ? customIslandInput.trim() : editingItem.island?.trim()) || '常規物資';
    const finalSource = (isCustomSource ? customSourceInput.trim() : editingItem.source?.trim()) || '收割機';

    const itemToSave: Item = {
      ...editingItem,
      name: editingItem.name.trim(),
      island: finalIsland,
      source: finalSource,
      isFluid: !!editingItem.isFluid
    };

    if (isNew) {
      if (items.some(it => it.name === itemToSave.name)) {
        alert('已有相同名稱之食材物品！');
        return;
      }
      onSave([...items, itemToSave]);
    } else {
      onSave(items.map(it => it.name === itemToSave.name ? itemToSave : it));
    }
    setEditingItem(null);
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 min-w-[200px] sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋食材、特性或途徑..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Island Filter */}
          <select
            value={islandFilter}
            onChange={(e) => setIslandFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="ALL">全部島嶼分類 ({items.length})</option>
            {dynamicIslands.map(isl => (
              <option key={isl} value={isl}>🏝️ {isl}</option>
            ))}
          </select>

          {/* Physical State Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
          >
            <option value="ALL">全部型態</option>
            <option value="solid">📦 僅看固態物品</option>
            <option value="liquid">💧 僅看液體流體</option>
          </select>
        </div>

        <button
          onClick={handleCreate}
          className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-sm font-bold transition-all shadow-md shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>新增食材與物品</span>
        </button>
      </div>

      {/* Items Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-xs shadow-sm">
                <th className="py-3 px-4">島嶼 / 分類</th>
                <th className="py-3 px-4">食材物品名稱</th>
                <th className="py-3 px-4">物理型態</th>
                <th className="py-3 px-4">取得 / 加工途徑</th>
                <th className="py-3 px-4">腐壞屬性</th>
                <th className="py-3 px-4">生化特性標籤</th>
                <th className="py-3 px-4">說明備註</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((it, idx) => {
                const isFluid = isItemFluid(it);
                return (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                      {it.island}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-100 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <ItemIcon name={it.name} icon={it.icon} size="sm" />
                        <span>{it.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      {isFluid ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                          <Droplet className="w-3 h-3 text-cyan-400" />
                          <span>液體流體</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                          <Box className="w-3 h-3 text-amber-400" />
                          <span>固態物品</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-amber-300 whitespace-nowrap">
                      {it.source}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      {it.isPerishable ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 font-mono">
                          {it.spoilTime ? `${it.spoilTime}秒 變質` : '會腐壞'}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono">永久常溫</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {it.attributes ? (
                        <div className="flex flex-wrap gap-1">
                          {it.attributes.split(/[/,， ]/).filter(Boolean).map((t, tIdx) => (
                            <span
                              key={tIdx}
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                                t.includes('過敏') || t.includes('凝固') || t.includes('中毒')
                                  ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                  : 'bg-slate-800 border-slate-700 text-slate-300'
                              }`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate" title={it.notes}>
                      {it.notes || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(it)}
                          className="text-slate-400 hover:text-amber-400 p-1 transition-colors"
                          title="編輯"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(it.name)}
                          className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                          title="刪除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center space-x-2">
              <span>{isNew ? '🌱 新增食材 / 物品' : `✏️ 編輯食材：${editingItem.name}`}</span>
            </h3>

            <form onSubmit={handleSaveModal} className="space-y-4 text-sm">
              {/* Photo & Icon Uploader Section */}
              <IconUploader
                value={editingItem.icon}
                onChange={(icon) => setEditingItem({ ...editingItem, icon })}
                itemName={editingItem.name}
              />

              {/* Row 1: Name and Island (Selection and Add New) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-40">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">食材名稱</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    disabled={!isNew}
                    placeholder="如：甜菜、生蛇蛋、番茄..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-400">所屬島嶼 / 分類</label>
                    {isCustomIsland && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomIsland(false);
                          setEditingItem({ ...editingItem, island: dynamicIslands[0] || '常規物資' });
                        }}
                        className="text-[11px] text-amber-400 hover:underline flex items-center space-x-0.5"
                      >
                        <span>← 選擇既有島嶼</span>
                      </button>
                    )}
                  </div>
                  {!isCustomIsland ? (
                    <select
                      value={editingItem.island}
                      onChange={(e) => {
                        if (e.target.value === '__CUSTOM__') {
                          setIsCustomIsland(true);
                          setCustomIslandInput('');
                          setEditingItem({ ...editingItem, island: '' });
                        } else {
                          setEditingItem({ ...editingItem, island: e.target.value });
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                    >
                      {dynamicIslands.map(isl => (
                        <option key={isl} value={isl}>🏝️ {isl}</option>
                      ))}
                      <option value="__CUSTOM__">➕ 新增自訂島嶼...</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="請輸入新島嶼名稱，如：新島嶼 (New Island)..."
                      value={customIslandInput}
                      onChange={(e) => {
                        setCustomIslandInput(e.target.value);
                        setEditingItem({ ...editingItem, island: e.target.value });
                      }}
                      className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      autoFocus
                    />
                  )}
                </div>
              </div>

              {/* Row 2: Source / Machine Selection (relative z-30 for dropdown) */}
              <div className="relative z-30">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-400">取得途徑 / 設備</label>
                  {isCustomSource && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomSource(false);
                        handleSourceSelect('收割機');
                      }}
                      className="text-[11px] text-amber-400 hover:underline flex items-center space-x-0.5"
                    >
                      <span>← 選擇標準途徑/設備</span>
                    </button>
                  )}
                </div>

                {!isCustomSource ? (
                  <SearchableSelect
                    groups={sourceGroups}
                    value={editingItem.source}
                    onChange={handleSourceSelect}
                    placeholder="搜尋或選擇採集設備、熟成途徑..."
                    size="sm"
                    className="w-full"
                  />
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="請輸入自訂途徑，如：特定商人購買、隱藏寶箱..."
                    value={customSourceInput}
                    onChange={(e) => {
                      setCustomSourceInput(e.target.value);
                      setEditingItem({ ...editingItem, source: e.target.value });
                    }}
                    className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                  />
                )}
              </div>

              {/* Row 3: Physical State (Solid vs Liquid) Toggle Pills (relative z-20) */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 relative z-20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <span>產物物理型態 (固態 / 液態)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    選取機台時自動設定，亦可手動切換
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, isFluid: false })}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      !editingItem.isFluid
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md ring-1 ring-amber-500/50'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-300'
                    }`}
                  >
                    <Box className="w-4 h-4 text-amber-400" />
                    <span>📦 固態物品 / 食材</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, isFluid: true })}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      editingItem.isFluid
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md ring-1 ring-cyan-500/50'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-300'
                    }`}
                  >
                    <Droplet className="w-4 h-4 text-cyan-400" />
                    <span>💧 液態流體 / 醬汁</span>
                  </button>
                </div>
              </div>

              {/* Row 4: Perishable Section (relative z-10) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">是否會腐壞 / 時序熟成？</label>
                  <input
                    type="checkbox"
                    checked={editingItem.isPerishable}
                    onChange={(e) => setEditingItem({ ...editingItem, isPerishable: e.target.checked })}
                    className="w-4 h-4 text-amber-500 rounded bg-slate-900 border-slate-700 focus:ring-amber-500"
                  />
                </div>

                {editingItem.isPerishable && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">腐壞/熟成秒數</label>
                      <input
                        type="number"
                        placeholder="如 30 (秒)"
                        value={editingItem.spoilTime || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, spoilTime: parseFloat(e.target.value) || null })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">變質後轉化產物</label>
                      <input
                        type="text"
                        placeholder="如：臭蛇蛋、中熟奶酪..."
                        value={editingItem.spoilProduct || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, spoilProduct: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Biochemical Attributes */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">
                  生化屬性與隔離標籤（點擊切換）
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_TAGS.map(tag => {
                    const active = (editingItem.attributes || '').includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleAttribute(tag)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          active
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {tag} {active ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  placeholder="自訂生化屬性標籤 (以 / 隔開)..."
                  value={editingItem.attributes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, attributes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">說明備註</label>
                <textarea
                  rows={2}
                  placeholder="加工說明、抗辣屬性、特殊物流等..."
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>儲存食材</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
