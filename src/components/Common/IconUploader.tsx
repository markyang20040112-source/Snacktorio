import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Search, Image as ImageIcon } from 'lucide-react';
import { getItemIcon, getAllAvailableIcons } from '../../utils/iconHelper';

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

  const allIcons = useMemo(() => getAllAvailableIcons(), []);

  const filteredIcons = useMemo(() => {
    if (!librarySearch.trim()) return allIcons;
    const term = librarySearch.trim().toLowerCase();
    return allIcons.filter(ic => ic.name.toLowerCase().includes(term));
  }, [allIcons, librarySearch]);

  const activeIconUrl = getItemIcon(itemName, value);
  const isCustom = !!value;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: max 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert('上傳圖片請小於 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        // Optimize image size using canvas if needed (clamp to max 64x64 or 128x128 for pixel icons)
        const img = new Image();
        img.onload = () => {
          const maxDim = 64;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false; // preserve pixel art!
            ctx.drawImage(img, 0, 0, w, h);
            const optimizedDataUrl = canvas.toDataURL('image/png');
            onChange(optimizedDataUrl);
          } else {
            onChange(dataUrl);
          }
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectLibraryIcon = (iconName: string) => {
    // Save relative icon path
    onChange(`${import.meta.env.BASE_URL}icons/${encodeURIComponent(iconName)}.png`);
    setShowLibraryModal(false);
  };

  const handleClear = () => {
    onChange(undefined);
  };

  return (
    <div className="bg-[#0b1419] p-3 rounded-xl border border-[#1f3542] space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
          <span>物品照片 / 遊戲圖示連動</span>
        </label>
        <span className="text-[11px] text-slate-400">
          支援上傳圖片或自遊戲圖庫選取
        </span>
      </div>

      <div className="flex items-center space-x-4">
        {/* Preview Frame */}
        <div className="w-14 h-14 rounded-xl bg-[#081014] border-2 border-dashed border-[#233a46] flex items-center justify-center p-1 relative group shrink-0 shadow-inner">
          {activeIconUrl ? (
            <img
              src={activeIconUrl}
              alt="預覽"
              className="w-full h-full object-contain pixelated"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-600">
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

          {isCustom && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs transition-all"
              title="清除自訂照片，還原為系統預設"
            >
              <X className="w-3.5 h-3.5" />
              <span>還原</span>
            </button>
          )}
        </div>
      </div>

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

            <div className="flex items-center space-x-2 mb-3">
              <ImageIcon className="w-5 h-5 text-amber-400" />
              <h4 className="text-base font-bold text-slate-100">
                選擇遊戲原生圖示 (共 {allIcons.length} 個)
              </h4>
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
              {filteredIcons.map((ic) => (
                <button
                  type="button"
                  key={ic.name}
                  onClick={() => handleSelectLibraryIcon(ic.name)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#0f1b22] hover:bg-[#162731] border border-[#203643] hover:border-amber-500/60 transition-all group text-center"
                >
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
