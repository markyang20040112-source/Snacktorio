import React, { useState } from 'react';
import { Recipe, Item } from '../../types';
import { Plus, Edit2, Trash2, Search, X, Check } from 'lucide-react';

interface RecipeManagerProps {
  recipes: Recipe[];
  items: Item[];
  onSave: (recipes: Recipe[]) => void;
}

export const RecipeManager: React.FC<RecipeManagerProps> = ({
  recipes,
  items,
  onSave
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [islandFilter, setIslandFilter] = useState('ALL');
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isNew, setIsNew] = useState(false);

  const islands = Array.from(new Set(recipes.map(r => r.island).filter(Boolean)));

  const filtered = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.inputs.some(inp => inp.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (r.fluidType || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIsland = islandFilter === 'ALL' || r.island === islandFilter;
    return matchesSearch && matchesIsland;
  });

  const handleEdit = (r: Recipe) => {
    setEditingRecipe(JSON.parse(JSON.stringify(r)));
    setIsNew(false);
  };

  const handleCreate = () => {
    setEditingRecipe({
      island: islands[0] || '波莫拉 (Pomora)',
      name: '',
      machine: '自動廚師機',
      fluidType: '無',
      fluidRate: 0.0,
      inputs: [{ name: items[0]?.name || '', count: 1 }],
      cycleTime: 5,
      outputCount: 1,
      notes: ''
    });
    setIsNew(true);
  };

  const handleDelete = (name: string) => {
    if (confirm(`確定要刪除料理「${name}」嗎？`)) {
      onSave(recipes.filter(r => r.name !== name));
    }
  };

  const addInputRow = () => {
    if (!editingRecipe || editingRecipe.inputs.length >= 4) return;
    setEditingRecipe({
      ...editingRecipe,
      inputs: [...editingRecipe.inputs, { name: items[0]?.name || '', count: 1 }]
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

    if (isNew) {
      if (recipes.some(r => r.name === editingRecipe.name)) {
        alert('已有相同名稱之終端料理！');
        return;
      }
      onSave([...recipes, editingRecipe]);
    } else {
      onSave(recipes.map(r => r.name === editingRecipe.name ? editingRecipe : r));
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
                <th className="py-3 px-4">所屬島嶼</th>
                <th className="py-3 px-4">料理名稱</th>
                <th className="py-3 px-4">固體食材清單 (1:1 配比)</th>
                <th className="py-3 px-4">持續組裝流體</th>
                <th className="py-3 px-4 text-right">出餐基準速率</th>
                <th className="py-3 px-4">注意事項</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 text-xs font-mono text-slate-400">
                    {r.island}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-100">
                    {r.name}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {r.inputs.map((inp, iIdx) => (
                        <span key={iIdx} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-200">
                          {inp.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono">
                    {r.fluidType !== '無' ? (
                      <span className="text-cyan-300 font-bold">
                        {r.fluidType} (1.0 fl/s)
                      </span>
                    ) : (
                      <span className="text-slate-500">無流體</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-300 font-bold whitespace-nowrap">
                    12 <span className="text-[10px] text-slate-400">份/分</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingRecipe(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {isNew ? '🍲 新增終端料理食譜' : `✏️ 編輯料理：${editingRecipe.name}`}
            </h3>

            <form onSubmit={handleSaveModal} className="space-y-4 text-sm">
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
                  <input
                    type="text"
                    value={editingRecipe.island}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, island: e.target.value })}
                    placeholder="如：波莫拉 (Pomora)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
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

                {editingRecipe.inputs.map((inp, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 font-mono w-4">#{idx+1}</span>
                    <select
                      value={inp.name}
                      onChange={(e) => {
                        const newInputs = [...editingRecipe.inputs];
                        newInputs[idx].name = e.target.value;
                        setEditingRecipe({ ...editingRecipe, inputs: newInputs });
                      }}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none"
                    >
                      {items.map(it => (
                        <option key={it.name} value={it.name}>{it.name} ({it.source})</option>
                      ))}
                    </select>

                    <span className="text-xs font-mono text-slate-400 px-2 py-1 bg-slate-900 rounded border border-slate-800">
                      固定 1 個
                    </span>

                    {editingRecipe.inputs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInputRow(idx)}
                        className="text-slate-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Fluid Input (Max 1 fluid, 1.0 fl/s) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-300">
                  終端組裝持續液體 (最多 1 種，固定 1.0 fl/s)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">醬汁/液體種類</label>
                    <input
                      type="text"
                      placeholder="無、塔瑪茄醬、白醬、炙烈紅油..."
                      value={editingRecipe.fluidType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingRecipe({
                          ...editingRecipe,
                          fluidType: val,
                          fluidRate: (val && val !== '無') ? 1.0 : 0.0
                        });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">組裝流率 (fl/s)</label>
                    <input
                      type="number"
                      disabled
                      value={editingRecipe.fluidType !== '無' && editingRecipe.fluidType ? 1.0 : 0.0}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 font-mono disabled:opacity-75"
                    />
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

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRecipe(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all"
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
