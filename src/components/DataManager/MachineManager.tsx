import React, { useState } from 'react';
import { Machine } from '../../types';
import { Plus, Edit2, Trash2, Search, X, Check } from 'lucide-react';
import { ItemIcon } from '../Common/ItemIcon';
import { IconUploader } from '../Common/IconUploader';

interface MachineManagerProps {
  machines: Machine[];
  onSave: (machines: Machine[]) => void;
}

export const MachineManager: React.FC<MachineManagerProps> = ({ machines, onSave }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [isNew, setIsNew] = useState(false);

  const filtered = machines.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (m: Machine) => {
    setEditingMachine({ ...m });
    setIsNew(false);
  };

  const handleCreate = () => {
    setEditingMachine({
      category: '轉化烹調',
      name: '',
      goblins: 1,
      power: 1.0,
      fluidType: '無',
      fluidRate: 0.0,
      baseRate: '0.2',
      notes: ''
    });
    setIsNew(true);
  };

  const handleDelete = (name: string) => {
    if (confirm(`確定要刪除設備「${name}」嗎？`)) {
      onSave(machines.filter(m => m.name !== name));
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMachine || !editingMachine.name.trim()) return;

    if (isNew) {
      if (machines.some(m => m.name === editingMachine.name)) {
        alert('已有相同名稱之設備！');
        return;
      }
      onSave([...machines, editingMachine]);
    } else {
      onSave(machines.map(m => m.name === editingMachine.name ? editingMachine : m));
    }
    setEditingMachine(null);
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="搜尋設備名稱或分類..."
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
          <span>新增機器設備</span>
        </button>
      </div>

      {/* Machines Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs">
                <th className="py-3 px-4">設備分類</th>
                <th className="py-3 px-4">機器名稱</th>
                <th className="py-3 px-4 text-right">妖精需求</th>
                <th className="py-3 px-4 text-right">運轉電力 (FV/s)</th>
                <th className="py-3 px-4">支援流體</th>
                <th className="py-3 px-4 text-right">流體率 (fl/s)</th>
                <th className="py-3 px-4">特殊機制說明</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 text-xs font-mono text-slate-400">
                    {m.category}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-100">
                    <div className="flex items-center space-x-2.5">
                      <ItemIcon name={m.name} icon={m.icon} size="sm" />
                      <span>{m.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-400">
                    {m.goblins}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-400">
                    {m.power}
                  </td>
                  <td className="py-3 px-4 text-xs text-cyan-300">
                    {m.fluidType}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-cyan-400">
                    {m.fluidRate}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate" title={m.notes}>
                    {m.notes || '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleEdit(m)}
                        className="text-slate-400 hover:text-amber-400 p-1 transition-colors"
                        title="編輯"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(m.name)}
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
      {editingMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingMachine(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {isNew ? '✨ 新增機器設備' : `✏️ 編輯機器設備：${editingMachine.name}`}
            </h3>

            <form onSubmit={handleSaveModal} className="space-y-4 text-sm">
              <IconUploader
                value={editingMachine.icon}
                onChange={(icon) => setEditingMachine({ ...editingMachine, icon })}
                itemName={editingMachine.name}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">設備名稱</label>
                  <input
                    type="text"
                    required
                    value={editingMachine.name}
                    onChange={(e) => setEditingMachine({ ...editingMachine, name: e.target.value })}
                    disabled={!isNew}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">設備分類</label>
                  <select
                    value={editingMachine.category}
                    onChange={(e) => setEditingMachine({ ...editingMachine, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="收割採集">收割採集</option>
                    <option value="轉化烹調">轉化烹調</option>
                    <option value="組裝終端">組裝終端</option>
                    <option value="必備機器">必備機器 / 物流</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">建造小妖精 (個)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingMachine.goblins}
                    onChange={(e) => setEditingMachine({ ...editingMachine, goblins: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">運轉電力 (FV/s)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editingMachine.power}
                    onChange={(e) => setEditingMachine({ ...editingMachine, power: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">支援液體種類</label>
                  <input
                    type="text"
                    placeholder="無、水、油、虛空、醬汁..."
                    value={editingMachine.fluidType}
                    onChange={(e) => setEditingMachine({ ...editingMachine, fluidType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">持續流體流率 (fl/s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editingMachine.fluidRate}
                    onChange={(e) => setEditingMachine({ ...editingMachine, fluidRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">特殊機制說明</label>
                <textarea
                  rows={2}
                  placeholder="原位轉化、空載凝結、固定 0.5 fl/s 等特性..."
                  value={editingMachine.notes}
                  onChange={(e) => setEditingMachine({ ...editingMachine, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingMachine(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>儲存設備</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
