import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Recipe } from '../../types';
import { Search, ChevronDown, Check, X, UtensilsCrossed } from 'lucide-react';

interface RecipeSearchSelectProps {
  recipes: Recipe[];
  value: string;
  onChange: (dishName: string) => void;
  className?: string;
  size?: 'sm' | 'md';
  placeholder?: string;
}

export const RecipeSearchSelect: React.FC<RecipeSearchSelectProps> = ({
  recipes,
  value,
  onChange,
  className = '',
  size = 'md',
  placeholder = '選擇目標料理...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Filter recipes based on search query (name, island, ingredients, fluid)
  const filteredRecipes = useMemo(() => {
    if (!searchQuery.trim()) return recipes;
    const q = searchQuery.trim().toLowerCase();
    return recipes.filter(r => {
      const matchName = r.name.toLowerCase().includes(q);
      const matchIsland = (r.island || '').toLowerCase().includes(q);
      const matchInputs = r.inputs?.some(inp => inp.name.toLowerCase().includes(q));
      const matchFluid = (r.fluidType || '').toLowerCase().includes(q);
      return matchName || matchIsland || matchInputs || matchFluid;
    });
  }, [recipes, searchQuery]);

  // Group filtered recipes by island
  const islandGroups = useMemo(() => {
    const map = new Map<string, Recipe[]>();
    filteredRecipes.forEach(r => {
      const isl = r.island || '未知島嶼';
      if (!map.has(isl)) map.set(isl, []);
      map.get(isl)!.push(r);
    });
    return Array.from(map.entries());
  }, [filteredRecipes]);

  // Reset highlight index when search results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredRecipes]);

  // Handle clicking outside to close dropdown
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

  const handleSelect = (dishName: string) => {
    onChange(dishName);
    setIsOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      setHighlightedIndex(prev => (prev + 1) % (filteredRecipes.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + (filteredRecipes.length || 1)) % (filteredRecipes.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredRecipes[highlightedIndex]) {
        handleSelect(filteredRecipes[highlightedIndex].name);
      }
    }
  };

  const selectedRecipe = recipes.find(r => r.name === value);

  // Sizing styles
  const isSm = size === 'sm';
  const triggerPadding = isSm ? 'px-3 py-2 text-sm rounded-lg' : 'px-4 py-2.5 rounded-xl text-base';

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full ${isOpen ? 'z-50' : 'z-20'} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-left transition-all ${
          isSm 
            ? 'bg-slate-900 border border-slate-700 hover:border-slate-600 focus:ring-1 focus:ring-amber-500' 
            : 'bg-slate-950 border border-slate-700 hover:border-slate-600 focus:ring-2 focus:ring-amber-500'
        } ${triggerPadding} ${
          isOpen ? 'ring-2 ring-amber-500/60 border-amber-500/60' : ''
        }`}
      >
        <div className="flex items-center space-x-2 truncate mr-2">
          <UtensilsCrossed className={`${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-400 shrink-0`} />
          <span className="truncate font-medium text-slate-100">
            {value || placeholder}
          </span>
          {selectedRecipe?.island && (
            <span className="hidden sm:inline-block text-[11px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50 shrink-0">
              {selectedRecipe.island}
            </span>
          )}
        </div>
        <ChevronDown 
          className={`${isSm ? 'w-4 h-4' : 'w-4 h-4'} text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`} 
        />
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/60">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋料理名稱、島嶼或食材..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-8 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-200 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Quick Result Counter or Tip */}
            <div className="flex items-center justify-between px-1 pt-1.5 text-[11px] text-slate-400">
              <span>
                {searchQuery ? `找到 ${filteredRecipes.length} 道料理` : `共 ${recipes.length} 道料理`}
              </span>
              <span className="text-slate-500 text-[10px]">可直接打字或鍵盤 ↑↓ 切換</span>
            </div>
          </div>

          {/* Recipe List */}
          <div 
            ref={listRef} 
            className="max-h-64 sm:max-h-80 overflow-y-auto divide-y divide-slate-800/40 p-1 custom-scrollbar"
          >
            {islandGroups.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Search className="w-7 h-7 mx-auto mb-2 text-slate-600 opacity-60" />
                <p className="text-sm font-medium text-slate-300">查無符合「{searchQuery}」的料理</p>
                <p className="text-xs text-slate-500 mt-1">請嘗試輸入其他關鍵字或食材</p>
              </div>
            ) : (
              islandGroups.map(([island, list]) => (
                <div key={island} className="py-1">
                  {/* Island Header */}
                  <div className="px-2.5 py-1 text-[11px] font-bold text-amber-400/90 tracking-wider flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                    <span>🏝️ {island}</span>
                    <span className="text-[10px] text-slate-500 font-normal">{list.length} 道</span>
                  </div>

                  {/* Dishes in this island */}
                  <div className="space-y-0.5 mt-0.5">
                    {list.map(r => {
                      const isSelected = r.name === value;
                      const globalIdx = filteredRecipes.findIndex(item => item.name === r.name);
                      const isHighlighted = globalIdx === highlightedIndex;

                      // Check if match came from ingredient
                      const matchedIngredient = searchQuery.trim() 
                        ? r.inputs?.find(inp => inp.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                        : null;

                      return (
                        <button
                          key={r.name}
                          ref={isSelected ? selectedItemRef : null}
                          type="button"
                          data-highlighted={isHighlighted ? "true" : undefined}
                          onClick={() => handleSelect(r.name)}
                          onMouseEnter={() => setHighlightedIndex(globalIdx)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-sm rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                              : isHighlighted
                              ? 'bg-slate-800 text-slate-100'
                              : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="block truncate">{r.name}</span>
                            {matchedIngredient && (
                              <span className="block text-[10px] text-amber-400/80 font-normal">
                                包含食材: {matchedIngredient.name}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
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
