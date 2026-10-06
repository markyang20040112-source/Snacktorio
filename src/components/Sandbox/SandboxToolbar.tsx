import React from 'react';
import { FolderKanban, Save, Cloud, Copy, Clipboard, BoxSelect } from 'lucide-react';

interface SandboxToolbarProps {
  currentBlueprintName: string;
  currentBlueprintId: string | null;
  isMarqueeMode: boolean;
  quickSaveFeedback: string | null;
  onQuickSave: () => void;
  onOpenBlueprints: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleMarquee: () => void;
}

/** 畫布左上角浮動專案控制列 (產線專案/藍圖管理、剪貼簿、框選工具與操作提示) */
export const SandboxToolbar: React.FC<SandboxToolbarProps> = ({
  currentBlueprintName,
  currentBlueprintId,
  isMarqueeMode,
  quickSaveFeedback,
  onQuickSave,
  onOpenBlueprints,
  onCopy,
  onPaste,
  onToggleMarquee
}) => {
  return (
    <div className="absolute top-3.5 left-3.5 z-20 flex items-center space-x-2 bg-[#091217]/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-[#1e3340] text-xs text-slate-300 shadow-2xl">
      <div className="flex items-center space-x-2 pr-2 border-r border-[#1e3340]">
        <FolderKanban className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium">當前產線專案</span>
          <span className="font-bold text-slate-100 max-w-[140px] truncate" title={currentBlueprintName}>
            {currentBlueprintName}
          </span>
        </div>
        {currentBlueprintId && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="已關聯專案" />
        )}
      </div>

      <button
        onClick={onQuickSave}
        className="px-2.5 py-1.5 hover:bg-slate-800 hover:text-amber-300 rounded-xl transition-colors flex items-center space-x-1 text-slate-300"
        title="儲存變更 (Ctrl+S / 點擊快速覆寫)"
      >
        <Save className="w-3.5 h-3.5" />
        <span>儲存</span>
      </button>

      <button
        onClick={onOpenBlueprints}
        className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl transition-colors flex items-center space-x-1 font-bold shadow-sm"
        title="開啟產線專案庫 (無限儲存、複製副本、重新命名、匯入匯出)"
      >
        <FolderKanban className="w-3.5 h-3.5" />
        <span>專案庫 / 藍圖</span>
      </button>

      <button
        onClick={onOpenBlueprints}
        className="px-2.5 py-1.5 hover:bg-purple-950/40 text-purple-300 hover:text-purple-200 rounded-xl transition-colors flex items-center space-x-1 border border-purple-800/40"
        title="一鍵同步至 GitHub 跨裝置帶著走"
      >
        <Cloud className="w-3.5 h-3.5" />
        <span>同步 GIT</span>
      </button>

      {/* 剪貼簿 複製 / 貼上 按鈕 */}
      <div className="flex items-center pl-1 border-l border-[#1e3340] space-x-1">
        <button
          onClick={onCopy}
          className="px-2 py-1.5 hover:bg-slate-800 hover:text-cyan-300 rounded-xl transition-colors flex items-center space-x-1 text-slate-300"
          title="複製選取機台或全廠產線至剪貼簿 (Ctrl+C)"
        >
          <Copy className="w-3.5 h-3.5 text-cyan-400" />
          <span>複製</span>
        </button>
        <button
          onClick={onPaste}
          className="px-2 py-1.5 hover:bg-slate-800 hover:text-emerald-300 rounded-xl transition-colors flex items-center space-x-1 text-slate-300"
          title="貼上剪貼簿產線 (Ctrl+V，可重複貼上至任何頁面)"
        >
          <Clipboard className="w-3.5 h-3.5 text-emerald-400" />
          <span>貼上</span>
        </button>
        <button
          onClick={onToggleMarquee}
          className={`px-2 py-1.5 rounded-xl transition-colors flex items-center space-x-1 ${
            isMarqueeMode 
              ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400 font-bold' 
              : 'hover:bg-slate-800 text-slate-300'
          }`}
          title={isMarqueeMode ? "點擊退出框選模式" : "點擊切換框選工具（亦可直接在畫布按住 Shift 鍵拖曳框選）"}
        >
          <BoxSelect className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isMarqueeMode ? '框選中' : '框選 (Shift)'}</span>
        </button>
      </div>

      {quickSaveFeedback && (
        <div className="px-2 py-1 bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[11px] rounded-lg animate-fadeIn font-bold">
          {quickSaveFeedback}
        </div>
      )}
    </div>
  );
};
