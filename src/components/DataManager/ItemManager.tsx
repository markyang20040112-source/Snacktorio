import React, { useState } from 'react';
import { Item } from '../../types';
import { Plus, Edit2, Trash2, Search, X, Check } from 'lucide-react';

interface ItemManagerProps {
  items: Item[];
  onSave: (items: Item[]) => void;
}

const COMMON_TAGS = ['過敏原', '遇熱凝固', '氣味刺鼻', '中毒', '發酵膨脹', '虛空底料'];

export const ItemManager: React.FC<ItemManagerProps> = ({ items, onSave }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [islandFilter, setIslandFilter] = useState('ALL');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);

  const islands = Array.from(new Set(items.map(it => it.island).filter(Boolean)));

  const filtered = items.filter(it => {
    const matchesSearch = it.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          it.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (it.attributes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIsland = islandFilter === 'ALL' || it.island === islandFilter;
    return matchesSearch && matchesIsland;
  });

  const handleEdit = (it: Item) => {
    setEditingItem({ ...it });
    setIsNew(false);
  };

  const handleCreate = () => {
    setEditingItem({
      island: islands[0] || '波莫拉 (Pomora)',
      name: '',
      source: '收割機',
      isPerishable: false,
      spoilTime: null,
      spoilProduct: '',
      attributes: '',
      notes: ''
    });
    setIsNew(true);
  };

  const handleDelete = (name: string) => {
    if (confirm(`確定要刪除食材/物品「${name}」嗎？`)) {
      onSave(items.filter(it => it.name !== name));
    }
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

    if (isNew) {
      if (items.some(it => it.name === editingItem.name)) {
        alert('已有相同名稱之食材物品！');
        return;
      }
      onSave([...items, editingItem]);
    } else {
      onSave(items.map(it => it.name === editingItem.name ? editingItem : it));
    }
    setEditingItem(null);
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
              placeholder="搜尋食材、特性或途徑..."
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
            <option value="ALL">全部島嶼分類 ({items.length})</option>
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
                <th className="py-3 px-4">食材名稱</th>
                <th className="py-3 px-4">取得 / 加工途徑</th>
                <th className="py-3 px-4">腐壞屬性</th>
                <th className="py-3 px-4">生化特性標籤</th>
                <th className="py-3 px-4">說明備註</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((it, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 text-xs font-mono text-slate-400">
                    {it.island}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-100">
                    {it.name}
                  </td>
                  <td className="py-3 px-4 text-xs text-amber-300">
                    {it.source}
                  </td>
                  <td className="py-3 px-4 text-xs">
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
              ))}
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

            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {isNew ? '🌱 新增食材 / 物品' : `✏️ 編輯食材：${editingItem.name}`}
            </h3>

            <form onSubmit={handleSaveModal} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">食材名稱</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    disabled={!isNew}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">所屬島嶼 / 分類</label>
                  <input
                    type="text"
                    value={editingItem.island}
                    onChange={(e) => setEditingItem({ ...editingItem, island: e.target.value })}
                    placeholder="如：波莫拉 (Pomora)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">取得途徑 / 設備</label>
                <input
                  type="text"
                  placeholder="收割機、採掘機、發酵罐、油炸鍋、物質操縱機..."
                  value={editingItem.source}
                  onChange={(e) => setEditingItem({ ...editingItem, source: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Perishable Section */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
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
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-850">
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
