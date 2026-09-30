import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Search, Image as ImageIcon, Trash2, RotateCcw, Ban, Sparkles, RefreshCw } from 'lucide-react';
import { getItemIcon, getDefaultIcon, getAllAvailableIcons, AvailableIcon } from '../../utils/iconHelper';
import { processAndBeautifyImage } from '../../utils/imageBeautifier';

export interface IconUploaderProps {
  value?: string;
  onChange: (icon?: string) => void;
  itemName?: string;
}

export const IconUploader: React.FC<IconUploaderProps> = ({
  value,
  onChange,
  itemName = ''
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryTab, setLibraryTab] = useState<'all' | 'custom' | 'native'>('all');
  const [rawCustomUrl, setRawCustomUrl] = useState<string | null>(null);
  const [beautifiedCustomUrl, setBeautifiedCustomUrl] = useState<string | null>(null);
  const [isBeautified, setIsBeautified] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const allIcons = useMemo(() => getAllAvailableIcons(), [showLibraryModal]);

  const customIconsCount = useMemo(() => allIcons.filter(ic => ic.isCustom).length, [allIcons]);
  const nativeIconsCount = useMemo(() => allIcons.filter(ic => !ic.isCustom).length, [allIcons]);

  const filteredIcons = useMemo(() => {
    let list = allIcons;
    if (libraryTab === 'custom') {
      list = list.filter(ic => ic.isCustom);
    } else if (libraryTab === 'native') {
      list = list.filter(ic => !ic.isCustom);
    }

    if (!librarySearch.trim()) return list;
    const term = librarySearch.trim().toLowerCase();
    return list.filter(ic => ic.name.toLowerCase().includes(term));
  }, [allIcons, libraryTab, librarySearch]);

  const activeIconUrl = getItemIcon(itemName, value);
  const defaultIconUrl = getDefaultIcon(itemName);
  const isDeleted = value === 'none';
  const isCustom = !!value && value !== 'none';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: max 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert('上傳圖片請小於 2MB');
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        try {
          const res = await processAndBeautifyImage(dataUrl);
          setRawCustomUrl(res.rawUrl);
          setBeautifiedCustomUrl(res.beautifiedUrl);
          setIsBeautified(true);
          onChange(res.beautifiedUrl);
        } catch {
          onChange(dataUrl);
        } finally {
          setIsProcessing(false);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectLibraryIcon = (ic: AvailableIcon) => {
    onChange(ic.url);
    setShowLibraryModal(false);
  };

  const handleDeleteImage = () => {
    onChange('none');
  };

  const handleRestoreDefault = () => {
    onChange(undefined);
  };

  const handleReBeautify = async () => {
    if (!value || value === 'none' || value.includes('/icons/')) return;
    setIsProcessing(true);
    try {
      const res = await processAndBeautifyImage(value);
      setRawCustomUrl(res.rawUrl);
      setBeautifiedCustomUrl(res.beautifiedUrl);
      setIsBeautified(true);
      onChange(res.beautifiedUrl);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#0b1419] p-3 rounded-xl border border-[#1f3542] space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
          <span>物品照片 / 遊戲圖示連動</span>
        </label>
        <span className="text-[11px] text-amber-400/90 flex items-center space-x-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>上傳自動智慧去背修邊</span>
        </span>
      </div>

      <div className="flex items-center space-x-4">
        {/* Preview Frame */}
        <div className="w-14 h-14 rounded-xl bg-[#081014] border-2 border-dashed border-[#233a46] flex items-center justify-center p-1 relative group shrink-0 shadow-inner">

          {activeIconUrl ? (
            <>
              <img
                src={activeIconUrl}
                alt="預覽"
                className="w-full h-full object-contain pixelated"
                style={{ imageRendering: 'pixelated' }}
              />
              <button
                type="button"
                onClick={handleDeleteImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md border border-rose-400 transition-transform hover:scale-110"
                title="刪除/移除此圖片"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          ) : isDeleted ? (
            <div className="flex flex-col items-center justify-center text-rose-400/90 text-center px-1">
              <Ban className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-bold">已刪除圖片</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-600 text-center px-1">
              <ImageIcon className="w-5 h-5 mb-0.5 opacity-50" />
              <span className="text-[9px]">無圖示</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex-1 flex flex-wrap items-center gap-2">
          {/* File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isCustom ? '更換自訂照片' : '上傳照片 / 截圖'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLibraryModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#14232a] hover:bg-[#1a2d36] text-teal-300 border border-teal-500/40 text-xs font-medium transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span>自圖庫挑選 ({allIcons.length})</span>
          </button>

          {/* Delete Image Button */}
          {!isDeleted && activeIconUrl && (
            <button
              type="button"
              onClick={handleDeleteImage}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all"
              title="刪除此物品的圖片 (設為無圖示)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>刪除圖片</span>
            </button>
          )}

          {/* Restore Default Button (if customized or deleted, and default exists) */}
          {(isCustom || isDeleted) && defaultIconUrl && (
            <button
              type="button"
              onClick={handleRestoreDefault}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 text-xs transition-all"
              title="還原為系統原生物品圖示"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>還原預設</span>
            </button>
          )}
        </div>
      </div>

      {/* Smart Beautifier Toggle Bar (Shown for custom uploaded images) */}
      {isCustom && !value?.startsWith('http') && !value?.includes('/icons/') && (
        <div className="flex flex-wrap items-center justify-between bg-[#081014] px-3 py-2 rounded-lg border border-[#1b2f3b] text-xs gap-2">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-slate-200">去背與修邊模式：</span>
            <span className="text-[11px] text-slate-400">
              {isBeautified ? '已自動消除背景雜色與邊框' : '顯示未去背之完整原圖'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => {
                if (beautifiedCustomUrl) {
                  onChange(beautifiedCustomUrl);
                  setIsBeautified(true);
                } else {
                  handleReBeautify();
                }
              }}
              disabled={isProcessing}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                isBeautified
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {isProcessing && isBeautified ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 text-amber-400" />
              )}
              <span>✨ 智慧去背 (推薦)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (rawCustomUrl) {
                  onChange(rawCustomUrl);
                  setIsBeautified(false);
                }
              }}
              disabled={!rawCustomUrl || isProcessing}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                !isBeautified
                  ? 'bg-slate-700 text-slate-200 border border-slate-500 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title={rawCustomUrl ? '切換為原始完整截圖' : '當前無原始圖快取'}
            >
              <span>📷 原始原圖</span>
            </button>
          </div>
        </div>
      )}

      {/* Library Selection Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-[#0e171c] border border-[#223945] rounded-2xl max-w-xl w-full p-5 shadow-2xl relative flex flex-col max-h-[85vh]">
            <button
              type="button"
              onClick={() => setShowLibraryModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-between mb-2 pr-6">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-bold text-slate-100">
                  選擇圖示庫 (共 {allIcons.length} 個)
                </h4>
              </div>
              {customIconsCount > 0 && (
                <span className="text-[11px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  ✨ 含 {customIconsCount} 個自訂圖片
                </span>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center space-x-1.5 mb-2.5">
              <button
                type="button"
                onClick={() => setLibraryTab('all')}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  libraryTab === 'all'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                    : 'bg-[#081014] text-slate-400 border border-[#1f3542] hover:bg-slate-800'
                }`}
              >
                全部 ({allIcons.length})
              </button>
              {customIconsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLibraryTab('custom')}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    libraryTab === 'custom'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                      : 'bg-[#081014] text-slate-400 border border-[#1f3542] hover:bg-slate-800'
                  }`}
                >
                  ✨ 自訂上傳 ({customIconsCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setLibraryTab('native')}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  libraryTab === 'native'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                    : 'bg-[#081014] text-slate-400 border border-[#1f3542] hover:bg-slate-800'
                }`}
              >
                🎮 遊戲原生 ({nativeIconsCount})
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="搜尋食材、機器、物資名稱..."
                className="w-full bg-[#081014] border border-[#203643] rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                autoFocus
              />
            </div>

            {/* Icons Grid */}
            <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[420px] p-2 bg-[#081014] rounded-xl border border-[#1b2d38] grid grid-cols-4 sm:grid-cols-6 gap-2">
              {/* Option to clear/remove image */}
              <button
                type="button"
                onClick={() => {
                  handleDeleteImage();
                  setShowLibraryModal(false);
                }}
                className="col-span-2 flex items-center space-x-2 p-2 rounded-xl bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/40 hover:border-rose-400 transition-all group text-left"
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-rose-950/40 border border-rose-500/60 shrink-0 text-rose-400">
                  <Ban className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <span className="block text-xs font-bold text-rose-300">
                    移除圖片
                  </span>
                  <span className="block text-[10px] text-rose-400/80">
                    不使用任何圖示
                  </span>
                </div>
              </button>

              {filteredIcons.map((ic) => (
                <button
                  type="button"
                  key={ic.name}
                  onClick={() => handleSelectLibraryIcon(ic)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#0f1b22] hover:bg-[#162731] border border-[#203643] hover:border-amber-500/60 transition-all group text-center relative"
                >
                  {ic.isCustom && (
                    <span className="absolute top-1 right-1 px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
                      自訂
                    </span>
                  )}
                  <div className="w-10 h-10 flex items-center justify-center p-1 rounded-lg bg-[#0b1419] border border-[#263e4c] group-hover:border-amber-400/80 mb-1.5">
                    <img
                      src={ic.url}
                      alt={ic.name}
                      className="w-full h-full object-contain pixelated"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-300 font-medium truncate w-full group-hover:text-amber-300">
                    {ic.name}
                  </span>
                </button>
              ))}

              {filteredIcons.length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-slate-500">
                  查無符合「{librarySearch}」之圖示
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-[#1b2d38] mt-3">
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
