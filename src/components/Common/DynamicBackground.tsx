import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';

interface Scene {
  id: number;
  src: string;
  title: string;
  subtitle: string;
}

const BASE = import.meta.env.BASE_URL;

const SCENES: Scene[] = [
  {
    id: 1,
    src: `${BASE}assets/bg_scene_1.jpg`,
    title: '迷霧群山與地下虛空管網',
    subtitle: 'Misty Mountains & Void Liquid Grid'
  },
  {
    id: 2,
    src: `${BASE}assets/bg_scene_2.jpg`,
    title: '蟑螂奶與乳品熟成輸送流水線',
    subtitle: 'Roach Milk & Dairy Processing Line'
  },
  {
    id: 3,
    src: `${BASE}assets/bg_scene_3.jpg`,
    title: '辣醬工坊與高溫通油油炸區',
    subtitle: 'Salsa Murder Hot Sauce & Fryer Hub'
  },
  {
    id: 4,
    src: `${BASE}assets/bg_scene_4.jpg`,
    title: '麵團烘焙與連續通水供液管網',
    subtitle: 'Bread Dough Baking & Water Pump Station'
  },
  {
    id: 5,
    src: `${BASE}assets/bg_scene_5.jpg`,
    title: '立體高架輸送帶與發電工廠',
    subtitle: 'Multi-tier Conveyor & Power Furnace Grid'
  }
];

// Random focus points for the Ken Burns cinematic zoom
const FOCUS_ORIGINS = [
  '20% 25%', // Top-left machinery
  '80% 25%', // Top-right processors
  '30% 70%', // Bottom-left pipelines & void pool
  '70% 75%', // Bottom-right power & generators
  '50% 45%', // Center assembly hub
  '15% 55%', // Mid-left harvest nodes
  '85% 60%'  // Mid-right logistics tanks
];

const SCENE_DURATION_MS = 12000; // 12 seconds per scene

export const DynamicBackground: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentOrigin, setCurrentOrigin] = useState('50% 50%');
  const [nextOrigin, setNextOrigin] = useState('20% 25%');
  const [showControls, setShowControls] = useState(false);

  // Pick a random origin that is different from previous
  const getRandomOrigin = (prev: string): string => {
    const choices = FOCUS_ORIGINS.filter(o => o !== prev);
    return choices[Math.floor(Math.random() * choices.length)] || '50% 50%';
  };

  const advanceScene = () => {
    setIsCrossfading(true);
    const incomingIdx = (currentIndex + 1) % SCENES.length;
    setNextIndex(incomingIdx);
    setNextOrigin(getRandomOrigin(currentOrigin));

    // After fade transition (2.5s), commit current index
    setTimeout(() => {
      setCurrentIndex(incomingIdx);
      setCurrentOrigin(nextOrigin);
      setIsCrossfading(false);
    }, 2500);
  };

  const jumpToScene = (idx: number) => {
    if (idx === currentIndex || isCrossfading) return;
    setIsCrossfading(true);
    setNextIndex(idx);
    setNextOrigin(getRandomOrigin(currentOrigin));
    setTimeout(() => {
      setCurrentIndex(idx);
      setCurrentOrigin(nextOrigin);
      setIsCrossfading(false);
    }, 2500);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      advanceScene();
    }, SCENE_DURATION_MS);

    return () => clearInterval(timer);
  }, [isPlaying, currentIndex, currentOrigin, nextOrigin, isCrossfading]);

  const currentScene = SCENES[currentIndex];
  const nextScene = SCENES[nextIndex];

  return (
    <>
      {/* Dynamic Background Container */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#070d10]">
        
        {/* Layer 1: Current Active Scene */}
        <div
          key={`scene-${currentScene.id}`}
          className={`absolute inset-0 bg-cover bg-no-repeat transition-opacity duration-[2500ms] ease-in-out ${
            isCrossfading ? 'opacity-0' : 'opacity-40'
          }`}
          style={{
            backgroundImage: `url('${currentScene.src}')`,
            transformOrigin: currentOrigin,
            transform: isCrossfading ? 'scale(1.18)' : 'scale(1.04)',
            transition: 'transform 12s cubic-bezier(0.25, 1, 0.5, 1), opacity 2.5s ease-in-out',
            willChange: 'transform, opacity'
          }}
        />

        {/* Layer 2: Next Scene (Cross-fading In) */}
        {isCrossfading && (
          <div
            key={`scene-next-${nextScene.id}`}
            className="absolute inset-0 bg-cover bg-no-repeat opacity-40 transition-opacity duration-[2500ms] ease-in-out"
            style={{
              backgroundImage: `url('${nextScene.src}')`,
              transformOrigin: nextOrigin,
              transform: 'scale(1.16)',
              transition: 'transform 12s cubic-bezier(0.25, 1, 0.5, 1)',
              willChange: 'transform, opacity'
            }}
          />
        )}

        {/* Industrial Pixel Factory Dark Mist Overlay (Protects Readability) */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c161b]/82 via-[#091116]/92 to-[#060c0f]/97 backdrop-blur-[1.5px]" />
      </div>

      {/* Floating Ambient Scene Controller (Bottom Right) */}
      <div 
        className="fixed bottom-3 right-3 z-30 pointer-events-auto"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        <div className={`flex items-center space-x-2 bg-[#0e181e]/90 backdrop-blur-md border border-[#223945] rounded-full px-3 py-1.5 shadow-2xl transition-all ${
          showControls ? 'opacity-100 scale-100 ring-1 ring-amber-500/30' : 'opacity-60 hover:opacity-100'
        }`}>
          {/* Current scene name indicator */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-medium select-none pr-1">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="hidden sm:inline text-slate-400 text-[11px]">工廠實景:</span>
            <span className="text-amber-300 font-bold max-w-[140px] truncate text-[11px]">
              {currentScene.title}
            </span>
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center space-x-1">
            {SCENES.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => jumpToScene(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex
                    ? 'w-4 bg-amber-400 shadow-sm shadow-amber-400/50'
                    : 'bg-slate-700 hover:bg-slate-500'
                }`}
                title={`切換至場景 ${s.id}：${s.title}`}
              />
            ))}
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1 rounded-full text-slate-400 hover:text-amber-300 transition-colors"
            title={isPlaying ? '暫停背景輪播' : '繼續背景輪播'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          {/* Next Scene Button */}
          <button
            onClick={advanceScene}
            disabled={isCrossfading}
            className="p-1 rounded-full text-slate-400 hover:text-amber-300 transition-colors disabled:opacity-40"
            title="切換到下一張背景"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
};
