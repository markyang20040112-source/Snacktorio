import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Plus } from 'lucide-react';
import { ItemIcon } from './ItemIcon';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

export interface SelectOptionGroup {
  label?: string;
  options: SelectOption[];
}

interface SearchableSelectProps {
  groups: SelectOptionGroup[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
  allowCustom?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  groups,
  value,
  onChange,
  placeholder = '請選擇...',
  className = '',
  size = 'sm',
  disabled = false,
  allowCustom = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Find currently selected option
  const currentOption = useMemo(() => {
    for (const g of groups) {
      const found = g.options.find(opt => opt.value === value);
      if (found) return found;
    }
    return null;
  }, [groups, value]);

  // Filter groups and options based on query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.trim().toLowerCase();
    return groups
      .map(g => ({
        ...g,
        options: g.options.filter(
          opt =>
            opt.label.toLowerCase().includes(q) ||
            opt.value.toLowerCase().includes(q) ||
            (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
        ),
      }))
      .filter(g => g.options.length > 0);
  }, [groups, searchQuery]);

  // Flattened filtered options for keyboard navigation
  const flatOptions = useMemo(() => {
    return filteredGroups.flatMap(g => g.options);
  }, [filteredGroups]);

  // Reset highlight index when search results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredGroups]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // When dropdown opens, focus search input and scroll to selected item
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
        if (selectedItemRef.current) {
          selectedItemRef.current.scrollIntoView({ block: 'nearest' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Keep highlighted item in view during keyboard arrow navigation
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector<HTMLElement>('[data-highlighted="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % (flatOptions.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + (flatOptions.length || 1)) % (flatOptions.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatOptions[highlightedIndex]) {
        handleSelect(flatOptions[highlightedIndex].value);
      } else if (allowCustom && searchQuery.trim()) {
        handleSelect(searchQuery.trim());
      }
    }
  };

  // Sizing styles
  let triggerPadding = 'px-3 py-2 text-sm rounded-lg';
  let textSize = 'text-sm';
  if (size === 'xs') {
    triggerPadding = 'px-2.5 py-1.5 text-xs rounded-lg';
    textSize = 'text-xs';
  } else if (size === 'md') {
    triggerPadding = 'px-4 py-2.5 text-base rounded-xl';
    textSize = 'text-base';
  }

  const displayText = currentOption ? currentOption.label : (value || placeholder);

  return (
    <div
      ref={containerRef}
      className={`relative ${isOpen ? 'z-50' : 'z-10'} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-left transition-all ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
            : 'bg-slate-900 border border-slate-700 hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500'
        } ${triggerPadding} ${
          isOpen ? 'ring-1 ring-amber-500 border-amber-500' : ''
        }`}
      >
        <div className="flex items-center space-x-2 truncate">
          <ItemIcon name={value} size="xs" showBorder={false} />
          <span className={`truncate font-medium ${currentOption || value ? 'text-slate-100' : 'text-slate-500'}`}>
            {displayText}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ml-1.5 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-1.5 border-b border-slate-800 bg-slate-950/60">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="輸入關鍵字搜尋..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-md pl-8 pr-7 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-200 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {/* Quick Result Counter or Tip */}
            <div className="flex items-center justify-between px-1 pt-1 text-[10px] text-slate-400">
              <span>{searchQuery ? `找到 ${flatOptions.length} 項` : `共 ${flatOptions.length} 項`}</span>
              <span className="text-slate-500">可打字、Enter自訂或方向鍵選擇</span>
            </div>
          </div>

          {/* Quick Custom Input Action if search query doesn't match an existing option */}
          {allowCustom && searchQuery.trim() && !flatOptions.some(o => o.value.toLowerCase() === searchQuery.trim().toLowerCase()) && (
            <div className="p-1 border-b border-slate-800/80 bg-amber-950/20">
              <button
                type="button"
                onClick={() => handleSelect(searchQuery.trim())}
                className="w-full flex items-center space-x-2 px-2 py-1.5 text-left text-xs font-bold text-amber-300 hover:bg-amber-500/20 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="truncate">使用自訂項目：「{searchQuery.trim()}」</span>
              </button>
            </div>
          )}

          {/* Options List */}
          <div
            ref={listRef}
            className="max-h-56 sm:max-h-64 overflow-y-auto divide-y divide-slate-800/40 p-1 custom-scrollbar"
          >
            {filteredGroups.length === 0 ? (
              <div className="py-6 text-center text-slate-400 px-3">
                <Search className="w-5 h-5 mx-auto mb-1.5 text-slate-600 opacity-60" />
                <p className="text-xs font-medium text-slate-300">查無符合「{searchQuery}」的預設項目</p>
                {allowCustom && searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSelect(searchQuery.trim())}
                    className="mt-2.5 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>使用「{searchQuery.trim()}」作為自訂輸入</span>
                  </button>
                )}
              </div>
            ) : (
              filteredGroups.map((group, gIdx) => (
                <div key={gIdx} className="py-0.5">
                  {/* Group Label */}
                  {group.label && (
                    <div className="px-2 py-0.5 text-[10px] font-bold text-amber-400/90 tracking-wider flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                      <span>{group.label}</span>
                      <span className="text-[9px] text-slate-500 font-normal">{group.options.length} 項</span>
                    </div>
                  )}

                  {/* Options */}
                  <div className="space-y-0.5 mt-0.5">
                    {group.options.map(opt => {
                      const isSelected = opt.value === value;
                      const globalIdx = flatOptions.findIndex(item => item.value === opt.value);
                      const isHighlighted = globalIdx === highlightedIndex;

                      return (
                        <button
                          key={opt.value}
                          ref={isSelected ? selectedItemRef : null}
                          type="button"
                          data-highlighted={isHighlighted ? "true" : undefined}
                          onClick={() => handleSelect(opt.value)}
                          onMouseEnter={() => setHighlightedIndex(globalIdx)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 text-left ${textSize} rounded-md transition-colors ${
                            isSelected
                              ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                              : isHighlighted
                              ? 'bg-slate-800 text-slate-100'
                              : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate pr-1.5">
                            <ItemIcon name={opt.value} size="xs" showBorder={false} />
                            <div className="truncate">
                              <span className="block truncate">{opt.label}</span>
                              {opt.badge && (
                                <span className="text-[10px] text-slate-400">{opt.badge}</span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
