import React, { useState, useMemo } from 'react';
import { IntermediateRecipe, Machine, Item } from '../../types';
import { SearchableSelect, SelectOptionGroup } from '../Common/SearchableSelect';
import { Plus, Edit2, Trash2, Search, X, Check, Lock, Sparkles } from 'lucide-react';
import { formatFractionOrDecimal } from '../../utils/math';
import { ItemIcon } from '../Common/ItemIcon';
import { IconUploader } from '../Common/IconUploader';

interface MachineConfig {
  outputType: 'solid' | 'liquid';
  cycleTime: number;
  outputCount: number;
  fluidType: string;
  fluidRate: number;
  isFixedFluid: boolean;
  isFixedRate: boolean;
  ratePresets?: { label: string; cycle: number; count: number }[];
  fluidPresets?: { type: string; rate: number; label: string }[];
  description: string;
}

const MACHINE_CONFIGS: Record<string, MachineConfig> = {
  '煮鍋': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '水',
    fluidRate: 1.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '水煮熟化：固定通水 1.0 fl/s，基準速率 0.2/s (5秒1個)'
  },
  '油炸鍋': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '油',
    fluidRate: 1.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '油炸熟化：固定通油 1.0 fl/s，基準速率 0.2/s (5秒1個)'
  },
  '物質操縱機': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '虛空',
    fluidRate: 1.0,
    isFixedFluid: true,
    isFixedRate: false,
    ratePresets: [
      { label: '5秒 1個 (0.2/s, 標準)', cycle: 5, count: 1 },
      { label: '5秒 2個 (0.4/s, 蟑螂)', cycle: 5, count: 2 }
    ],
    description: '重構機：固定通虛空 1.0 fl/s，速率可選 0.2/s 或 0.4/s'
  },
  '烤箱': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '烘焙熟化：無需流體，基準速率 0.2/s (5秒1個)'
  },
  '擠出機': {
    outputType: 'solid',
    cycleTime: 4,
    outputCount: 1,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '固體擠出：無需流體，基準速率 0.25/s (4秒1個)'
  },
  '研磨機': {
    outputType: 'solid',
    cycleTime: 2,
    outputCount: 2,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: false,
    ratePresets: [
      { label: '2秒 2個 (1.0/s, 標準)', cycle: 2, count: 2 },
      { label: '2秒 1個 (0.5/s, 精細)', cycle: 2, count: 1 }
    ],
    description: '固體研磨：無需流體，預設 2秒2個 (1.0/s)'
  },
  '攪拌機': {
    outputType: 'liquid',
    cycleTime: 5,
    outputCount: 5,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '醬汁調配：產出液態醬汁 (1.0 fl/s = 5秒5個)'
  },
  '混合機': {
    outputType: 'solid',
    cycleTime: 4,
    outputCount: 1,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: false,
    isFixedRate: false,
    ratePresets: [
      { label: '4秒 1個 (0.25/s)', cycle: 4, count: 1 },
      { label: '4秒 2個 (0.50/s)', cycle: 4, count: 2 },
      { label: '4秒 3個 (0.75/s)', cycle: 4, count: 3 },
      { label: '5秒 5個 (1.00/s)', cycle: 5, count: 5 }
    ],
    fluidPresets: [
      { type: '無', rate: 0.0, label: '無液體 (0 fl/s)' },
      { type: '水', rate: 0.5, label: '水 (0.5 fl/s)' },
      { type: '油', rate: 0.5, label: '油 (0.5 fl/s)' },
      { type: '蟑螂奶', rate: 0.5, label: '蟑螂奶 (0.5 fl/s)' },
      { type: '炙烈紅油', rate: 0.5, label: '炙烈紅油 (0.5 fl/s)' }
    ],
    description: '多工混合：可選通液(0.5 fl/s)或不通液，速率可選 0.25 ~ 1.0/s'
  },
  '發酵罐': {
    outputType: 'solid',
    cycleTime: 10,
    outputCount: 5,
    fluidType: '水',
    fluidRate: 1.0,
    isFixedFluid: false,
    isFixedRate: true,
    fluidPresets: [
      { type: '水', rate: 1.0, label: '水 (1.0 fl/s)' },
      { type: '蟑螂奶', rate: 1.0, label: '蟑螂奶 (1.0 fl/s)' },
      { type: '油', rate: 1.0, label: '油 (1.0 fl/s)' }
    ],
    description: '時序發酵：需發酵液(1.0 fl/s)，基準速率 10秒5個 (0.5/s)'
  },
  '注入機': {
    outputType: 'liquid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '油',
    fluidRate: 2.0,
    isFixedFluid: false,
    isFixedRate: true,
    fluidPresets: [
      { type: '油', rate: 2.0, label: '環境油池 (2.0 fl/s)' },
      { type: '水', rate: 0.0, label: '環境水池 (0.0 fl/s)' }
    ],
    description: '原位轉化：產出轉化液體，抽取環境液體池'
  },
  '收割機': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '植物收割：無需流體，0.2/s (5秒1個)'
  },
  '採掘機': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 1,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '礦物採掘：無需流體，0.2/s (5秒1個)'
  },
  '裝配機': {
    outputType: 'solid',
    cycleTime: 5,
    outputCount: 8,
    fluidType: '無',
    fluidRate: 0.0,
    isFixedFluid: true,
    isFixedRate: true,
    description: '基建組裝：無需流體，5秒8個 (1.6/s)'
  }
};

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
  const [outputType, setOutputType] = useState<'solid' | 'liquid'>('solid');
  const [isNew, setIsNew] = useState(false);

  // Grouped options for Machine selection
  const machineGroups = useMemo<SelectOptionGroup[]>(() => {
    const map = new Map<string, Machine[]>();
    machines.forEach(m => {
      const cat = m.category || '其他設備';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(m);
    });

    return Array.from(map.entries()).map(([cat, list]) => ({
      label: `⚙️ ${cat}`,
      options: list.map(m => ({
        value: m.name,
        label: `${m.name} (${m.category})`,
        sublabel: m.baseRate || m.category
      }))
    }));
  }, [machines]);

  // Grouped options for raw material selection
  const rawMaterialGroups = useMemo<SelectOptionGroup[]>(() => {
    const groups: SelectOptionGroup[] = [];

    // Intermediate recipes (excluding currently edited one to avoid direct self-cycle)
    const interOptions = intermediate
      .filter(r => !editingRecipe || r.name !== editingRecipe.name)
      .map(r => ({
        value: r.name,
        label: `${r.name} (${r.machine})`,
        sublabel: r.machine
      }));

    if (interOptions.length > 0) {
      groups.push({
        label: '⚙️ 中間配方半成品',
        options: interOptions
      });
    }

    // Base items (exclude fluids from solid raw materials)
    const pureFluids = new Set(['水', '油', '虛空']);
    const itemOptions = items
      .filter(it => !it.isFluid && !pureFluids.has(it.name))
      .map(it => ({
        value: it.name,
        label: `${it.name} (${it.source})`,
        sublabel: it.source
      }));

    if (itemOptions.length > 0) {
      groups.push({
        label: '🥗 基礎食材與採集品',
        options: itemOptions
      });
    }

    return groups;
  }, [intermediate, items, editingRecipe?.name]);

  const flatRawOptions = useMemo(() => {
    return rawMaterialGroups.flatMap(g => g.options);
  }, [rawMaterialGroups]);

  const filtered = intermediate.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.machine.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.inputs.some(inp => inp.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleEdit = (r: IntermediateRecipe) => {
    setEditingRecipe(JSON.parse(JSON.stringify(r)));
    setIsNew(false);

    const config = MACHINE_CONFIGS[r.machine];
    if (r.machine === '攪拌機' || r.machine === '注入機' || r.notes?.includes('液態') || r.notes?.includes('醬汁')) {
      setOutputType('liquid');
    } else {
      setOutputType(config ? config.outputType : 'solid');
    }
  };

  const handleCreate = () => {
    const defaultMach = '混合機';
    const config = MACHINE_CONFIGS[defaultMach] || {
      outputType: 'solid',
      cycleTime: 4,
      outputCount: 1,
      fluidType: '無',
      fluidRate: 0.0,
      isFixedFluid: false,
      isFixedRate: false,
      description: ''
    };

    const defaultInput = items[0]?.name || intermediate[0]?.name || '';

    setEditingRecipe({
      name: '',
      machine: defaultMach,
      fluidType: config.fluidType,
      fluidRate: config.fluidRate,
      inputs: [{ name: defaultInput, count: 1 }],
      cycleTime: config.cycleTime,
      outputCount: config.outputCount,
      notes: ''
    });
    setOutputType(config.outputType);
    setIsNew(true);
  };

  const handleMachineChange = (machName: string) => {
    if (!editingRecipe) return;
    const config = MACHINE_CONFIGS[machName];

    if (!config) {
      const mach = machines.find(m => m.name === machName);
      setEditingRecipe({
        ...editingRecipe,
        machine: machName,
        fluidType: mach?.fluidType || '無',
        fluidRate: mach?.fluidRate || 0.0
      });
      return;
    }

    setEditingRecipe({
      ...editingRecipe,
      machine: machName,
      fluidType: config.fluidType,
      fluidRate: config.fluidRate,
      cycleTime: config.cycleTime,
      outputCount: config.outputCount,
    });
    setOutputType(config.outputType);
  };

  const handleDelete = (name: string) => {
    if (confirm(`確定要刪除中間配方「${name}」嗎？`)) {
      onSave(intermediate.filter(r => r.name !== name));
    }
  };

  const addInputRow = () => {
    if (!editingRecipe || editingRecipe.inputs.length >= 4) return;
    const defaultItem = items[0]?.name || intermediate[0]?.name || '';
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

  const currentMachConfig = editingRecipe ? MACHINE_CONFIGS[editingRecipe.machine] : null;

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
                <th className="py-3 px-4 whitespace-nowrap">產物名稱</th>
                <th className="py-3 px-4 whitespace-nowrap">加工設備</th>
                <th className="py-3 px-4 whitespace-nowrap">固體原料輸入 (1~4項)</th>
                <th className="py-3 px-4 whitespace-nowrap min-w-[130px]">所需液體</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">週期時間</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">產量</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">基準速率</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((r, idx) => {
                const rateNum = r.cycleTime > 0 ? r.outputCount / r.cycleTime : 0;
                const isFluidProd = r.machine === '攪拌機' || r.machine === '注入機';
                return (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-100 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <ItemIcon name={r.name} icon={r.icon} size="sm" />
                        <span>{r.name}</span>
                        {isFluidProd && (
                          <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
                            💧 液態
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono whitespace-nowrap">
                        <ItemIcon name={r.machine} size="xs" showBorder={false} />
                        <span>{r.machine}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300">
                      <div className="flex flex-wrap gap-1">
                        {r.inputs.map((inp, iIdx) => (
                          <span key={iIdx} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 whitespace-nowrap inline-flex items-center space-x-1">
                            <ItemIcon name={inp.name} size="xs" showBorder={false} />
                            <span>{inp.name} ×{inp.count}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-cyan-300 whitespace-nowrap">
                      {r.fluidType !== '無' ? (
                        <span className="inline-flex items-center space-x-1 whitespace-nowrap">
                          <ItemIcon name={r.fluidType} size="xs" showBorder={false} />
                          <span>{r.fluidType}</span>
                          <span className="text-cyan-400 font-normal">({r.fluidRate} fl/s)</span>
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {r.cycleTime} 秒
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {r.outputCount} {isFluidProd ? 'fl' : '個'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-300 font-bold">
                      {formatFractionOrDecimal(rateNum)} <span className="text-[10px] text-slate-400">{isFluidProd ? 'fl/s' : '/s'}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full shadow-2xl relative flex flex-col max-h-[90vh] my-auto overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <span>{isNew ? '⚙️ 新增中間加工配方' : `✏️ 編輯配方：${editingRecipe.name}`}</span>
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
              <IconUploader
                value={editingRecipe.icon}
                onChange={(icon) => setEditingRecipe({ ...editingRecipe, icon })}
                itemName={editingRecipe.name}
              />

              <div className="grid grid-cols-2 gap-4 relative z-40">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-400">產物製品名稱</label>
                    <div className="flex items-center space-x-1.5 whitespace-nowrap">
                      <span className="text-[11px] text-slate-500">型態:</span>
                      <button
                        type="button"
                        onClick={() => setOutputType(outputType === 'liquid' ? 'solid' : 'liquid')}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                          outputType === 'liquid'
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                        }`}
                        title="點擊切換固態/液態"
                      >
                        {outputType === 'liquid' ? '💧 液態醬汁' : '📦 固態原料'}
                      </button>
                    </div>
                  </div>
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

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-400">使用加工設備</label>
                    {currentMachConfig && (
                      <span className="text-[11px] text-amber-400/90 font-mono truncate max-w-[130px] text-right">
                        {currentMachConfig.outputType === 'liquid' ? '💧 產出流體' : '📦 產出固體'}
                      </span>
                    )}
                  </div>
                  <SearchableSelect
                    groups={machineGroups}
                    value={editingRecipe.machine}
                    onChange={handleMachineChange}
                    size="sm"
                    className="w-full"
                  />
                  {currentMachConfig?.description && (
                    <p className="text-[11px] text-amber-400/90 mt-1.5 flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span className="truncate">{currentMachConfig.description}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Solid Inputs (up to 4) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3 relative z-30">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-300">
                      固體原料清單 (最多支援 4 項)
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">點擊選單可直接輸入關鍵字搜尋原料</p>
                  </div>
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

                {editingRecipe.inputs.map((inp, idx) => {
                  const isInList = flatRawOptions.some(opt => opt.value === inp.name);
                  const rowGroups = (!isInList && inp.name)
                    ? [
                        ...rawMaterialGroups,
                        {
                          label: '✨ 當前原料',
                          options: [{ value: inp.name, label: inp.name }]
                        }
                      ]
                    : rawMaterialGroups;

                  return (
                    <div key={idx} className="flex items-center space-x-2 relative" style={{ zIndex: 10 - idx }}>
                      <span className="text-xs text-slate-500 font-mono w-4 shrink-0">#{idx+1}</span>
                      <SearchableSelect
                        groups={rowGroups}
                        value={inp.name}
                        onChange={(val) => {
                          const newInputs = [...editingRecipe.inputs];
                          newInputs[idx].name = val;
                          setEditingRecipe({ ...editingRecipe, inputs: newInputs });
                        }}
                        placeholder="搜尋原料名稱或來源設備..."
                        size="xs"
                        className="flex-1"
                      />

                      <div className="flex items-center space-x-1 shrink-0">
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
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <span className="text-xs text-slate-400 font-mono">個</span>
                      </div>

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

              {/* Fluid input */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 relative z-20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">所需液體配置</label>
                  {currentMachConfig?.isFixedFluid ? (
                    <span className="text-[11px] text-amber-400 font-mono flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>設備固定通液</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-cyan-400 font-mono">可自訂液體與流速</span>
                  )}
                </div>

                {/* Fluid Presets (if available) */}
                {currentMachConfig?.fluidPresets && currentMachConfig.fluidPresets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pb-1">
                    <span className="text-[11px] text-slate-400 mr-1">常用液體預設：</span>
                    {currentMachConfig.fluidPresets.map(fp => {
                      const isActive = editingRecipe.fluidType === fp.type && editingRecipe.fluidRate === fp.rate;
                      return (
                        <button
                          key={fp.label}
                          type="button"
                          onClick={() => setEditingRecipe({
                            ...editingRecipe,
                            fluidType: fp.type,
                            fluidRate: fp.rate
                          })}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            isActive
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                              : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {fp.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">所需液體種類</label>
                    <input
                      type="text"
                      placeholder="無、水、油、虛空、醬汁..."
                      value={editingRecipe.fluidType}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, fluidType: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">持續液體流量 (fl/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editingRecipe.fluidRate}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, fluidRate: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Cycle & Output */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">產能與加工週期</label>
                  {currentMachConfig?.isFixedRate ? (
                    <span className="text-[11px] text-amber-400 font-mono flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>設備固定基準速率</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-cyan-400 font-mono">可選速率規格</span>
                  )}
                </div>

                {/* Rate Presets (if available) */}
                {currentMachConfig?.ratePresets && currentMachConfig.ratePresets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pb-1">
                    <span className="text-[11px] text-slate-400 mr-1">規格預設：</span>
                    {currentMachConfig.ratePresets.map(preset => {
                      const isActive = editingRecipe.cycleTime === preset.cycle && editingRecipe.outputCount === preset.count;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setEditingRecipe({
                            ...editingRecipe,
                            cycleTime: preset.cycle,
                            outputCount: preset.count
                          })}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            isActive
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                              : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 pt-1">
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
                    <label className="block text-[11px] text-slate-400 mb-1">單次產量 ({outputType === 'liquid' ? 'fl' : '個'})</label>
                    <input
                      type="number"
                      min="1"
                      value={editingRecipe.outputCount}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, outputCount: parseFloat(e.target.value) || 1 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-amber-400 font-bold mb-1">折算速率 (=N/M)</label>
                    <div className="text-sm font-bold text-amber-300 font-mono py-1.5">
                      {formatFractionOrDecimal(calculatedRate)} <span className="text-xs text-slate-400">{outputType === 'liquid' ? 'fl/s' : '/s'}</span>
                    </div>
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
