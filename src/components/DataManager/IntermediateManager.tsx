import React, { useState } from 'react';
import { IntermediateRecipe, Machine, Item } from '../../types';
import { Plus, Edit2, Trash2, Search, X, Check } from 'lucide-react';
import { formatFractionOrDecimal } from '../../utils/math';

interface IntermediateManagerProps {
  intermediate: IntermediateRecipe[];
  machines: Machine[];
  items: Item[];
  onSave: (recipes: IntermediateRecipe[]) => void;
}

export const IntermediateManager: React.FC<IntermediateManagerProps> = ({
  intermediate,
  machines,
  items,
  onSave
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRecipe, setEditingRecipe] = useState<IntermediateRecipe | null>(null);
  const [isNew, setIsNew] = useState(false);

  const filtered = intermediate.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.machine.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.inputs.some(inp => inp.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleEdit = (r: IntermediateRecipe) => {
    setEditingRecipe(JSON.parse(JSON.stringify(r)));
    setIsNew(false);
  };

  const handleCreate = () => {
    setEditingRecipe({
      name: '',
      machine: machines[0]?.name || '混合機',
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
    if (confirm(`確定要刪除中間配方「${name}」嗎？`)) {
      onSave(intermediate.filter(r => r.name !== name));
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
      if (intermediate.some(r => r.name === editingRecipe.name)) {
        alert('已有相同名稱之中間配方！');
        return;
      }
      onSave([...intermediate, editingRecipe]);
    } else {
      onSave(intermediate.map(r => r.name === editingRecipe.name ? editingRecipe : r));
    }
    setEditingRecipe(null);
  };

  // Calculated rate
  const calculatedRate = editingRecipe && editingRecipe.cycleTime > 0
    ? editingRecipe.outputCount / editingRecipe.cycleTime
    : 0;

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="搜尋產物名稱、設備或原料..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <button
          onClick={handleCreate}
          className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-sm font-bold transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>新增中間加工配方</span>
        </button>
      </div>

      {/* Intermediate Recipes Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-xs shadow-sm">
                <th className="py-3 px-4">產物名稱</th>
                <th className="py-3 px-4">加工設備</th>
                <th className="py-3 px-4">固體原料輸入 (1~4項)</th>
                <th className="py-3 px-4">所需液體</th>
                <th className="py-3 px-4 text-right">週期時間</th>
                <th className="py-3 px-4 text-right">產量</th>
                <th className="py-3 px-4 text-right">基準速率</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((r, idx) => {
                const rateNum = r.cycleTime > 0 ? r.outputCount / r.cycleTime : 0;
                return (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-100">
                      {r.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono">
                        {r.machine}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300">
                      <div className="flex flex-wrap gap-1">
                        {r.inputs.map((inp, iIdx) => (
                          <span key={iIdx} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            {inp.name} ×{inp.count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-cyan-300">
                      {r.fluidType !== '無' ? `${r.fluidType} (${r.fluidRate} fl/s)` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {r.cycleTime} 秒
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {r.outputCount} 個
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-300 font-bold">
                      {formatFractionOrDecimal(rateNum)} <span className="text-[10px] text-slate-400">/s</span>
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
                );
              })}
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
              {isNew ? '⚙️ 新增中間加工配方' : `✏️ 編輯配方：${editingRecipe.name}`}
            </h3>

            <form onSubmit={handleSaveModal} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">產物製品名稱</label>
                  <input
                    type="text"
                    required
                    value={editingRecipe.name}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                    disabled={!isNew}
                    placeholder="如：生史萊姆肉丸、甘酒、芝士碎..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">使用加工設備</label>
                  <select
                    value={editingRecipe.machine}
                    onChange={(e) => {
                      const machName = e.target.value;
                      const mach = machines.find(m => m.name === machName);
                      let defaultFluidType = mach?.fluidType || '無';
                      let defaultFluidRate = mach?.fluidRate || 0.0;
                      if (machName === '混合機') defaultFluidRate = 0.5;
                      setEditingRecipe({
                        ...editingRecipe,
                        machine: machName,
                        fluidType: defaultFluidType,
                        fluidRate: defaultFluidRate
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {machines.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({m.category})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Solid Inputs (up to 4) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    固體原料清單 (最多支援 4 項)
                  </label>
                  {editingRecipe.inputs.length < 4 && (
                    <button
                      type="button"
                      onClick={addInputRow}
                      className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                    >
                      + 新增原料
                    </button>
                  )}
                </div>

                {editingRecipe.inputs.map((inp, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
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

                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      value={inp.count}
                      onChange={(e) => {
                        const newInputs = [...editingRecipe.inputs];
                        newInputs[idx].count = parseFloat(e.target.value) || 1;
                        setEditingRecipe({ ...editingRecipe, inputs: newInputs });
                      }}
                      className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono text-right"
                    />

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

              {/* Fluid input */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">所需液體種類</label>
                  <input
                    type="text"
                    placeholder="無、水、油、虛空、醬汁..."
                    value={editingRecipe.fluidType}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, fluidType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">持續液體流量 (fl/s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editingRecipe.fluidRate}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, fluidRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Cycle & Output */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">單次加工週期 (秒)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    value={editingRecipe.cycleTime}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, cycleTime: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">單次產量 (個)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingRecipe.outputCount}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, outputCount: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-amber-400 font-bold mb-1">自動折算速率 (=N/M)</label>
                  <div className="text-sm font-bold text-amber-300 font-mono py-1.5">
                    {formatFractionOrDecimal(calculatedRate)} <span className="text-xs text-slate-400">/s</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">特殊製程備註</label>
                <textarea
                  rows={2}
                  placeholder="如：需發酵緩衝管道、氣味刺鼻等..."
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
                  <span>儲存配方</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
