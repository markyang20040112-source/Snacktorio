import React, { useState, useEffect } from 'react';
import { SyncConfig } from '../../types';
import { syncDataToGitHub } from '../../services/githubSync';
import { RefreshCw, Key, GitBranch, Github, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export const SyncSettings: React.FC = () => {
  const [config, setConfig] = useState<SyncConfig>({
    githubToken: '',
    repoOwner: 'markyang20040112-source',
    repoName: 'Snacktorio',
    branch: 'main'
  });
  const [commitMessage, setCommitMessage] = useState('feat(data): update Snacktorio game databases from web workbench');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('snacktorio_sync_config_v1');
    if (saved) {
      try { setConfig(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleSaveConfig = () => {
    localStorage.setItem('snacktorio_sync_config_v1', JSON.stringify(config));
    alert('✅ GitHub 同步設定已儲存至瀏覽器本地！');
  };

  const handleTriggerSync = async () => {
    if (!config.githubToken || !config.repoOwner || !config.repoName) {
      alert('請先填寫 GitHub Token、使用者名稱與倉庫名稱！');
      return;
    }
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncDataToGitHub(config, commitMessage);
      setSyncResult(res);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Intro card */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-purple-500/10 border border-amber-500/20 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            GitHub API 一鍵雲端同步（跨裝置同步神技）
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          透過 GitHub 官方 REST API，您可以在**任何電腦、筆電、甚至是手機與 iPad 的瀏覽器中**，直接點擊下方按鈕，系統將自動向您的 GitHub 倉庫提交一個 Git Commit，將網頁端修改的最新資料存入倉庫中，徹底告別手動終端機指令！
        </p>
      </div>

      {/* Sync Configuration Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Github className="w-4 h-4 text-amber-400" />
          <span>倉庫連線參數設定</span>
        </h3>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
              <span>GitHub Personal Access Token (PAT)</span>
              <a
                href="https://github.com/settings/tokens/new"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:underline text-[11px]"
              >
                點此快速產生 Token ↗
              </a>
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={config.githubToken || ''}
                onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              只需勾選 <code className="text-slate-400">repo</code> 權限（或 fine-grained 的 Contents: Read & Write）。金鑰僅儲存於您本地瀏覽器，不會傳送至任何第三方伺服器。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">GitHub 帳號 (Owner)</label>
              <input
                type="text"
                placeholder="如：your-username"
                value={config.repoOwner || ''}
                onChange={(e) => setConfig({ ...config, repoOwner: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">倉庫名稱 (Repository)</label>
              <input
                type="text"
                value={config.repoName || 'Snacktorio'}
                onChange={(e) => setConfig({ ...config, repoName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">目標分支 (Branch)</label>
              <div className="relative">
                <GitBranch className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={config.branch || 'master'}
                  onChange={(e) => setConfig({ ...config, branch: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">本次 Commit 訊息說明</label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={handleSaveConfig}
              className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              記住此電腦設定
            </button>

            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '正在向 GitHub 提交變更...' : '🚀 一鍵同步變更至 GitHub 倉庫'}</span>
            </button>
          </div>
        </div>

        {/* Sync Result Alert */}
        {syncResult && (
          <div className={`p-4 rounded-xl border flex items-center space-x-2 text-sm font-medium ${
            syncResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {syncResult.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{syncResult.message}</span>
          </div>
        )}
      </div>

      {/* Manual Fallback card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-xs text-slate-400 space-y-2">
        <div className="font-bold text-slate-300">💡 若不想設定 GitHub Token：</div>
        <p>
          您依然可以正常在網頁上編輯新增所有資料，資料會即時存於您當前瀏覽器中。在需要時，只要至「資料工作台」右上角點擊「匯出 JSON」，就能直接下載最新資料檔案！
        </p>
      </div>
    </div>
  );
};
