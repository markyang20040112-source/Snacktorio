import React, { useState, useEffect, useRef } from 'react';
import { SandboxBlueprint, SandboxNodeData, SandboxConnection } from './sandboxTypes';
import { 
  sandboxBlueprintService, 
  isOfficialDishBlueprint, 
  isOfficialTutorialBlueprint 
} from '../../services/sandboxBlueprintService';
import { SyncConfig } from '../../types';
import {
  FolderKanban,
  Plus,
  Cloud,
  Download,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Edit2,
  Trash2,
  Save,
  Layers,
  Clock,
  Sparkles,
  ExternalLink,
  X,
  ArrowRight,
  RotateCcw,
  FilePlus
} from 'lucide-react';

interface SandboxBlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNodes: SandboxNodeData[];
  currentConnections: SandboxConnection[];
  currentPan: { x: number; y: number };
  currentZoom: number;
  currentBlueprintId: string | null;
  onLoadBlueprint: (bp: SandboxBlueprint) => void;
  onAppendBlueprint?: (bp: SandboxBlueprint) => void;
  onSaveCurrentSuccess: (bp: SandboxBlueprint) => void;
}

export const SandboxBlueprintModal: React.FC<SandboxBlueprintModalProps> = ({
  isOpen,
  onClose,
  currentNodes,
  currentConnections,
  currentPan,
  currentZoom,
  currentBlueprintId,
  onLoadBlueprint,
  onAppendBlueprint,
  onSaveCurrentSuccess
}) => {
  const [blueprints, setBlueprints] = useState<SandboxBlueprint[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'OFFICIAL' | 'CUSTOM'>('ALL');
  
  // 新建/另存為專案狀態
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // 重新命名狀態
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // GitHub 同步狀態
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [showGitConfig, setShowGitConfig] = useState(false);
  const [gitConfig, setGitConfig] = useState<SyncConfig>({
    githubToken: '',
    repoOwner: 'markyang20040112-source',
    repoName: 'Snacktorio',
    branch: 'main'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 載入藍圖列表與 Git 設定
  const refreshList = () => {
    setBlueprints(sandboxBlueprintService.getAllBlueprints());
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
      const savedConfig = localStorage.getItem('snacktorio_sync_config_v1');
      if (savedConfig) {
        try { setGitConfig(JSON.parse(savedConfig)); } catch {}
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 儲存當前畫布為新專案
  const handleSaveNewProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const bp = sandboxBlueprintService.saveBlueprint({
      name: newProjectName.trim(),
      description: newProjectDesc.trim(),
      nodes: currentNodes,
      connections: currentConnections,
      pan: currentPan,
      zoom: currentZoom
    });

    setIsSavingNew(false);
    setNewProjectName('');
    setNewProjectDesc('');
    refreshList();
    onSaveCurrentSuccess(bp);
  };

  // 覆寫目前開啟中的專案
  const handleOverwriteCurrent = (bp: SandboxBlueprint) => {
    if (window.confirm(`確定要將目前畫布內容覆寫至「${bp.name}」嗎？`)) {
      const updated = sandboxBlueprintService.saveBlueprint({
        name: bp.name,
        description: bp.description,
        nodes: currentNodes,
        connections: currentConnections,
        pan: currentPan,
        zoom: currentZoom,
        existingId: bp.id
      });
      refreshList();
      onSaveCurrentSuccess(updated);
    }
  };

  // 複製副本
  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const cloned = sandboxBlueprintService.duplicateBlueprint(id);
    if (cloned) {
      refreshList();
    }
  };

  // 刪除專案
  const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`確定要刪除產線專案「${name}」嗎？（此動作無法復原）`)) {
      sandboxBlueprintService.deleteBlueprint(id);
      refreshList();
    }
  };

  // 觸發重新命名
  const handleStartRename = (bp: SandboxBlueprint, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(bp.id);
    setEditingName(bp.name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      sandboxBlueprintService.renameBlueprint(id, editingName.trim());
      setEditingId(null);
      refreshList();
    }
  };

  // 匯出單一專案
  const handleExportSingle = (bp: SandboxBlueprint, e: React.MouseEvent) => {
    e.stopPropagation();
    sandboxBlueprintService.exportSingleBlueprintJson(bp);
  };

  // 匯入 JSON
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = sandboxBlueprintService.importBlueprintsJson(content);
        alert(result.message);
        if (result.success) {
          refreshList();
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 執行 GitHub 雲端同步
  const handleTriggerGitHubSync = async () => {
    if (!gitConfig.githubToken || !gitConfig.repoOwner || !gitConfig.repoName) {
      setShowGitConfig(true);
      return;
    }

    setIsSyncing(true);
    setSyncStatus(null);
    try {
      localStorage.setItem('snacktorio_sync_config_v1', JSON.stringify(gitConfig));
      const res = await sandboxBlueprintService.syncToGitHub(gitConfig);
      setSyncStatus(res);
      if (res.success) {
        setTimeout(() => setSyncStatus(null), 5000);
      }
    } catch (err: any) {
      setSyncStatus({ success: false, message: `同步發生錯誤: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const officialCount = blueprints.filter(bp => isOfficialDishBlueprint(bp) || isOfficialTutorialBlueprint(bp)).length;
  const customCount = blueprints.length - officialCount;

  // 篩選專案列表
  const filteredBlueprints = blueprints.filter(bp => {
    const isOfficial = isOfficialDishBlueprint(bp) || isOfficialTutorialBlueprint(bp);
    if (categoryFilter === 'OFFICIAL' && !isOfficial) return false;
    if (categoryFilter === 'CUSTOM' && isOfficial) return false;

    const q = searchQuery.toLowerCase();
    const matchName = bp.name.toLowerCase().includes(q);
    const matchDesc = bp.description?.toLowerCase().includes(q) ?? false;
    const matchDishes = bp.stats?.mainDishes.some(d => d.toLowerCase().includes(q)) ?? false;
    return matchName || matchDesc || matchDishes;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-4xl max-h-[90vh] bg-[#0c141a] border border-[#1e3240] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 彈窗頂部標題列 */}
        <div className="px-6 py-4 border-b border-[#1c2e38] bg-[#080e12] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">產線專案庫 (Saved Blueprints)</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-[#14232c] text-teal-300 border border-teal-500/30 font-bold">
                  {blueprints.length} 套產線
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                隨意儲存、複製、命名多套完整產線，支援 GitHub 雲端跨裝置同步
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. 操作功能區塊 (存新專案、同步GIT、匯入匯出) */}
        <div className="px-6 py-3.5 border-b border-[#1c2e38] bg-[#0a1217] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            {/* 新增空白專案按鈕 */}
            <button
              onClick={() => {
                if (currentNodes.length > 0 && !window.confirm('確定要建立全新空白專案嗎？當前畫布未儲存的變更將被清空。')) {
                  return;
                }
                const blankBp: SandboxBlueprint = {
                  id: `bp_custom_${Date.now()}`,
                  name: `未命名空白專案 ${customCount + 1}`,
                  description: '空白畫布，自由發揮設計',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  pan: { x: 100, y: 100 },
                  zoom: 1,
                  stats: { machineCount: 0, powerLoad: 0, mainDishes: [] },
                  nodes: [],
                  connections: []
                };
                const saved = sandboxBlueprintService.saveBlueprint(blankBp);
                onLoadBlueprint(saved);
                onClose();
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all shadow-sm shadow-cyan-500/10"
              title="建立一個全新的空白專案並載入至畫布"
            >
              <FilePlus className="w-4 h-4 text-cyan-400" />
              <span>➕ 新增空白專案</span>
            </button>

            {/* 另存為新專案按鈕 */}
            <button
              onClick={() => {
                setIsSavingNew(true);
                setNewProjectName(`產線專案 ${blueprints.length + 1}`);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all shadow-sm shadow-amber-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>將當前畫布存為新專案</span>
            </button>

            {/* 一鍵同步至 GitHub */}
            <button
              onClick={handleTriggerGitHubSync}
              disabled={isSyncing}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                gitConfig.githubToken
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/40'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={gitConfig.githubToken ? "將所有專案提交 Commit 至 GitHub 倉庫" : "設定 GitHub Token 以啟用跨裝置同步"}
            >
              <Cloud className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '正在同步至 GIT...' : '☁️ 一鍵同步至 GIT'}</span>
            </button>

            {/* 設定 GIT 齒輪 */}
            <button
              onClick={() => setShowGitConfig(!showGitConfig)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition-colors border border-slate-800"
              title="配置 GitHub Token 與倉庫設定"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* 匯入 JSON */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs transition-colors"
              title="由本機 JSON 檔案匯入產線"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>匯入</span>
            </button>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".json" 
              onChange={handleFileChange} 
              className="hidden" 
            />

            {/* 匯出全量 JSON */}
            <button
              onClick={() => sandboxBlueprintService.exportAllBlueprintsJson()}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs transition-colors"
              title="匯出全量專案庫為單一備份檔"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>匯出全庫</span>
            </button>

            {/* 恢復/載入官方全量食譜 */}
            <button
              onClick={() => {
                const restored = sandboxBlueprintService.restoreOfficialBlueprints();
                setBlueprints(restored);
                setSyncStatus({ success: true, message: `✅ 已成功重置並載入全套官方食譜藍圖庫（共 ${restored.length} 套專案）！` });
                setTimeout(() => setSyncStatus(null), 4000);
              }}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 text-xs transition-colors"
              title="載入全套 42 道官方食譜產線專案（安全保留您的自創專案）"
            >
              <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
              <span>載入官方食譜</span>
            </button>
          </div>
        </div>

        {/* 3. GitHub 同步反饋與快速設定面板 */}
        {syncStatus && (
          <div className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
            syncStatus.success 
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/60' 
              : 'bg-rose-950/40 text-rose-300 border-rose-900/60'
          }`}>
            <div className="flex items-center space-x-2">
              {syncStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
              <span>{syncStatus.message}</span>
            </div>
            <button onClick={() => setSyncStatus(null)} className="text-[11px] underline">關閉</button>
          </div>
        )}

        {showGitConfig && (
          <div className="px-6 py-3 bg-[#081017] border-b border-[#1c2e38] text-xs space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between font-bold text-slate-300">
              <span className="flex items-center space-x-1.5">
                <Cloud className="w-4 h-4 text-purple-400" />
                <span>GitHub 跨裝置同步授權設定</span>
              </span>
              <a 
                href="https://github.com/settings/tokens" 
                target="_blank" 
                rel="noreferrer" 
                className="text-[11px] text-cyan-400 hover:underline flex items-center space-x-0.5"
              >
                <span>取得 GitHub Token</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="md:col-span-2">
                <label className="text-[10px] text-slate-400">Personal Access Token (需 repo 權限):</label>
                <input
                  type="password"
                  value={gitConfig.githubToken}
                  onChange={(e) => setGitConfig({ ...gitConfig, githubToken: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full mt-0.5 px-2.5 py-1.5 bg-[#050b0e] border border-slate-800 rounded-xl text-xs font-mono text-purple-200 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Repo 擁有者 / 帳號:</label>
                <input
                  type="text"
                  value={gitConfig.repoOwner}
                  onChange={(e) => setGitConfig({ ...gitConfig, repoOwner: e.target.value })}
                  className="w-full mt-0.5 px-2.5 py-1.5 bg-[#050b0e] border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">倉庫名稱 / 分支:</label>
                <div className="flex items-center space-x-1 mt-0.5">
                  <input
                    type="text"
                    value={gitConfig.repoName}
                    onChange={(e) => setGitConfig({ ...gitConfig, repoName: e.target.value })}
                    className="w-2/3 px-2 py-1.5 bg-[#050b0e] border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={gitConfig.branch || 'main'}
                    onChange={(e) => setGitConfig({ ...gitConfig, branch: e.target.value })}
                    className="w-1/3 px-1.5 py-1.5 bg-[#050b0e] border border-slate-800 rounded-xl text-xs font-mono text-slate-400 focus:outline-none text-center"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  localStorage.setItem('snacktorio_sync_config_v1', JSON.stringify(gitConfig));
                  setShowGitConfig(false);
                  alert('✅ GitHub 同步設定已儲存！');
                }}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-colors"
              >
                儲存設定
              </button>
            </div>
          </div>
        )}

        {/* 4. 新增專案表單 */}
        {isSavingNew && (
          <form onSubmit={handleSaveNewProject} className="px-6 py-3.5 bg-[#101b22] border-b border-amber-900/40 text-xs space-y-2 animate-fadeIn">
            <div className="font-bold text-amber-300 flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>將當前畫布保存為新專案 ({currentNodes.length} 台機台、{currentConnections.length} 條管線)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-1">
                <input
                  type="text"
                  required
                  placeholder="輸入產線專案名稱 (如：反胃辣芝士 36份/分)..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#080f14] border border-amber-500/50 rounded-xl text-xs text-amber-200 placeholder-slate-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="md:col-span-2 flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="備註說明 (選填，如：含二級超頻虛空泵與2:1電網閉環)..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-[#080f14] border border-slate-800 rounded-xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shrink-0 shadow-md"
                >
                  確認儲存
                </button>
                <button
                  type="button"
                  onClick={() => setIsSavingNew(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors shrink-0"
                >
                  取消
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 5. 搜尋欄與分類篩選 */}
        <div className="px-6 py-2.5 border-b border-[#1c2e38] bg-[#091014] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 flex-1 min-w-[280px]">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="搜尋專案名稱、菜餚或備註..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-[#050b0e] border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* 分類篩選 Tab */}
            <div className="flex items-center bg-[#050b0e] p-0.5 rounded-xl border border-slate-800 text-[11px] font-bold">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  categoryFilter === 'ALL'
                    ? 'bg-slate-800 text-slate-100 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全部 ({blueprints.length})
              </button>
              <button
                onClick={() => setCategoryFilter('OFFICIAL')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  categoryFilter === 'OFFICIAL'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                官方食譜 ({officialCount})
              </button>
              <button
                onClick={() => setCategoryFilter('CUSTOM')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  categoryFilter === 'CUSTOM'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                自訂專案 ({customCount})
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            共找到 {filteredBlueprints.length} 個專案
          </div>
        </div>

        {/* 6. 專案卡片列表 (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredBlueprints.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <FolderKanban className="w-10 h-10 mx-auto text-slate-600 stroke-[1.5]" />
              <div className="text-sm font-medium">尚無符合搜尋的產線專案</div>
              <div className="text-xs text-slate-600">點擊上方「將當前畫布存為新專案」隨時記錄您的設計！</div>
            </div>
          ) : (
            filteredBlueprints.map(bp => {
              const isCurrent = bp.id === currentBlueprintId;
              const formattedDate = new Date(bp.updatedAt).toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={bp.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isCurrent
                      ? 'bg-[#101e28] border-cyan-500/50 ring-1 ring-cyan-500/30'
                      : 'bg-[#0e161c] hover:bg-[#131f26] border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* 左側：專案資訊 */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        {editingId === bp.id ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="px-2 py-0.5 bg-[#050b0e] border border-cyan-500 rounded-lg text-xs font-bold text-cyan-200 outline-none"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(bp.id); }}
                            />
                            <button
                              onClick={() => handleSaveRename(bp.id)}
                              className="px-2 py-0.5 bg-cyan-600 text-white rounded text-[11px] font-bold"
                            >
                              確定
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="font-bold text-sm text-slate-100 hover:text-cyan-300 transition-colors">
                              {bp.name}
                            </span>
                            {isOfficialDishBlueprint(bp) ? (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                                官方食譜
                              </span>
                            ) : isOfficialTutorialBlueprint(bp) ? (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-bold">
                                官方教學
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                                自訂專案
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                <span>當前開啟中</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 備註 */}
                      {bp.description && (
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {bp.description}
                        </p>
                      )}

                      {/* 標籤與統計指標 */}
                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 pt-0.5 flex-wrap gap-y-1">
                        <span className="flex items-center space-x-1 text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>{formattedDate}</span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center space-x-1 text-amber-400/90 font-mono">
                          <Layers className="w-3 h-3" />
                          <span>{bp.nodes.length} 設備</span>
                        </span>
                        <span>·</span>
                        <span className="font-mono text-cyan-400/90">
                          {bp.connections.length} 管線
                        </span>

                        {bp.stats?.mainDishes && bp.stats.mainDishes.length > 0 && (
                          <>
                            <span>·</span>
                            <div className="flex items-center space-x-1">
                              {bp.stats.mainDishes.map((dish, dIdx) => (
                                <span 
                                  key={dIdx} 
                                  className="px-1.5 py-0.2 rounded bg-purple-900/30 border border-purple-800/40 text-purple-300 text-[10px] font-bold"
                                >
                                  🍲 {dish}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 右側：操作按鈕群 */}
                    <div className="flex items-center space-x-1.5 shrink-0 self-start md:self-center">
                      {/* 打開 / 載入 */}
                      <button
                        onClick={() => {
                          onLoadBlueprint(bp);
                          onClose();
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all"
                        title="將此專案載入至畫布 (清空並覆寫當前畫布)"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>載入畫布</span>
                      </button>

                      {/* 追加至畫布 (不覆蓋，拼裝產線) */}
                      {onAppendBlueprint && (
                        <button
                          onClick={() => {
                            onAppendBlueprint(bp);
                          }}
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all"
                          title="將此產線複製並插入到當前畫布中（不覆蓋現有產線，可自由拼裝多料理產線）"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>追加至畫布</span>
                        </button>
                      )}

                      {/* 覆寫保存 (更新) */}
                      <button
                        onClick={() => handleOverwriteCurrent(bp)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
                        title="以目前畫布內容覆寫此專案"
                      >
                        <Save className="w-4 h-4" />
                      </button>

                      {/* 複製副本 */}
                      <button
                        onClick={(e) => handleDuplicate(bp.id, e)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-teal-300 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
                        title="建立此專案的副本 (Duplicate)"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* 重命名 */}
                      <button
                        onClick={(e) => handleStartRename(bp, e)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
                        title="重新命名"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* 單檔匯出 */}
                      <button
                        onClick={(e) => handleExportSingle(bp, e)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
                        title="匯出此專案為 .json 檔案"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {/* 刪除 */}
                      <button
                        onClick={(e) => handleDelete(bp.id, bp.name, e)}
                        className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors border border-transparent hover:border-rose-900/50"
                        title="刪除此專案"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 7. 底部資訊列 */}
        <div className="px-6 py-3 border-t border-[#1c2e38] bg-[#070e12] flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>本機已安全保存</span>
            {gitConfig.githubToken && (
              <span className="text-purple-400 ml-2">· 已連線 GitHub ({gitConfig.repoOwner}/{gitConfig.repoName})</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors"
          >
            返回畫布
          </button>
        </div>
      </div>
    </div>
  );
};
