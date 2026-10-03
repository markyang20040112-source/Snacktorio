import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxMetrics 
} from './sandboxTypes';
import { simulateSandboxPhysics } from './sandboxPhysics';
import { SandboxNode } from './SandboxNode';
import { Machine, Item, IntermediateRecipe, Recipe } from '../../types';
import { ItemIcon } from '../Common/ItemIcon';
import { 
  Zap, 
  Users, 
  Droplets, 
  Plus, 
  RotateCcw, 
  Search, 
  Compass, 
  Share2, 
  Play, 
  HelpCircle,
  FolderOpen,
  Sparkles,
  Layers,
  Flame
} from 'lucide-react';

interface SandboxSimulatorProps {
  machines: Machine[];
  items: Item[];
  intermediate: IntermediateRecipe[];
  recipes: Recipe[];
}

export const SandboxSimulator: React.FC<SandboxSimulatorProps> = ({
  machines,
  items,
  intermediate,
  recipes
}) => {
  // 核心沙盒狀態
  const [nodes, setNodes] = useState<SandboxNodeData[]>(() => {
    const saved = localStorage.getItem('snacktorio_sandbox_nodes_v1');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    // 預設樣板：1 台發電熔爐 + 1 台採煤機 + 1 台水泵 + 1 台煮鍋 (示範新手開局)
    return [
      {
        id: 'gen-1',
        type: 'generator',
        title: '虛空熔爐 (常規發電)',
        powerMode: 'regular',
        x: 80,
        y: 100,
        baseCycleTime: 10,
        baseOutputCount: 1,
        basePowerConsumption: 4.0,
        baseGoblins: 1,
        actualCycleTime: 10,
        efficiency: 1.0,
        actualPower: 4.0,
        actualGoblins: 1,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: [{ id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 }],
        outputs: []
      },
      {
        id: 'miner-1',
        type: 'machine',
        title: '採煤機 (供煤)',
        machineName: '採掘機',
        x: 80,
        y: 320,
        baseCycleTime: 5,
        baseOutputCount: 1,
        basePowerConsumption: 1.0,
        baseGoblins: 1,
        actualCycleTime: 5,
        efficiency: 1.0,
        actualPower: 1.0,
        actualGoblins: 1,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: [],
        outputs: [{ id: 'out-coal', name: '煤炭', type: 'solid', rateProvided: 0.2 }]
      }
    ];
  });

  const [connections, setConnections] = useState<SandboxConnection[]>(() => {
    const saved = localStorage.getItem('snacktorio_sandbox_conns_v1');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [
      {
        id: 'c-init-1',
        fromNodeId: 'miner-1',
        fromPortId: 'out-coal',
        toNodeId: 'gen-1',
        toPortId: 'in-coal',
        itemOrFluidName: '煤炭',
        type: 'solid',
        actualFlowRate: 0.1
      }
    ];
  });

  // 畫布視角狀態 (平移與縮放)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 側邊與抽屜選單狀態
  const [activeCatalogTab, setActiveCatalogTab] = useState<'machines' | 'fluids' | 'items' | 'recipes'>('machines');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 滑鼠互動狀態 (拖曳節點、拖曳畫布、拉線)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // 拉線中狀態
  const [connectingSource, setConnectingSource] = useState<{
    nodeId: string;
    portId: string;
    portType: 'solid' | 'fluid';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // ==========================================
  // 即時物理演算 (動態自適應更新)
  // ==========================================
  const { updatedNodes, updatedConnections, metrics } = useMemo(() => {
    return simulateSandboxPhysics(nodes, connections);
  }, [nodes, connections]);

  // 本機自動存檔
  useEffect(() => {
    localStorage.setItem('snacktorio_sandbox_nodes_v1', JSON.stringify(nodes));
    localStorage.setItem('snacktorio_sandbox_conns_v1', JSON.stringify(connections));
  }, [nodes, connections]);

  // ==========================================
  // 節點生成工廠 (純資料庫驅動，自適應未來任何新配方)
  // ==========================================
  const handleAddMachineWithRecipe = (mach: Machine, recipeOrInter?: IntermediateRecipe | Recipe) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    // 解析輸入端口
    const inputs: SandboxNodeData['inputs'] = [];
    if (recipeOrInter) {
      (recipeOrInter.inputs || []).forEach((inp, idx) => {
        if (inp.name && inp.name !== '無' && inp.count > 0) {
          inputs.push({
            id: `in-${idx}-${inp.name}`,
            name: inp.name,
            type: 'solid',
            rateRequired: Number((inp.count / (recipeOrInter.cycleTime || 5)).toFixed(3))
          });
        }
      });
      if (recipeOrInter.fluidType && recipeOrInter.fluidType !== '無') {
        inputs.push({
          id: `in-fluid-${recipeOrInter.fluidType}`,
          name: recipeOrInter.fluidType,
          type: 'fluid',
          rateRequired: recipeOrInter.fluidRate || 1.0
        });
      }
    }

    // 解析輸出端口
    const outputs: SandboxNodeData['outputs'] = [];
    if (recipeOrInter) {
      outputs.push({
        id: `out-${recipeOrInter.name}`,
        name: recipeOrInter.name,
        type: mach.name === '注入機' || (recipeOrInter as any).fluidType === '無' && recipeOrInter.name.includes('油') ? 'fluid' : 'solid',
        rateProvided: Number(((recipeOrInter.outputCount || 1) / (recipeOrInter.cycleTime || 5)).toFixed(3))
      });
    }

    const newNode: SandboxNodeData = {
      id,
      type: 'machine',
      title: recipeOrInter ? recipeOrInter.name : mach.name,
      machineName: mach.name,
      recipeName: recipeOrInter?.name,
      x: -pan.x + 350 + Math.random() * 60,
      y: -pan.y + 200 + Math.random() * 60,
      baseCycleTime: recipeOrInter?.cycleTime || 5,
      baseOutputCount: recipeOrInter?.outputCount || 1,
      basePowerConsumption: mach.power,
      baseGoblins: mach.goblins,
      actualCycleTime: recipeOrInter?.cycleTime || 5,
      efficiency: 1.0,
      actualPower: mach.power,
      actualGoblins: mach.goblins,
      fluidSaturation: 1.0,
      solidSaturation: 1.0,
      inputs,
      outputs
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const handleAddInfrastructure = (type: 'generator' | 'pump' | 'environment_pool', subtype?: string) => {
    const id = `infra-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    let node: SandboxNodeData;

    if (type === 'generator') {
      node = {
        id,
        type: 'generator',
        title: subtype === 'overclock' ? '虛空熔爐 (超頻發電 16 FV/s)' : '虛空熔爐 (常規發電 4 FV/s)',
        powerMode: subtype === 'overclock' ? 'overclock' : 'regular',
        x: -pan.x + 350,
        y: -pan.y + 200,
        baseCycleTime: 10,
        baseOutputCount: 1,
        basePowerConsumption: subtype === 'overclock' ? 16.0 : 4.0,
        baseGoblins: 1,
        actualCycleTime: 10,
        efficiency: 1.0,
        actualPower: subtype === 'overclock' ? 16.0 : 4.0,
        actualGoblins: 1,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: subtype === 'overclock' 
          ? [
              { id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 },
              { id: 'in-sludge', name: '虛空汙泥', type: 'solid', rateRequired: 0.1 }
            ]
          : [{ id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 }],
        outputs: []
      };
    } else if (type === 'pump') {
      const isOC = subtype === 'overclock';
      const fluidName = subtype?.includes('油') ? '油' : subtype?.includes('虛空') ? '虛空' : '水';
      node = {
        id,
        type: 'pump',
        title: `${fluidName}抽取泵機 (${isOC ? '超頻 8 fl/s' : '常規 2 fl/s'})`,
        powerMode: isOC ? 'overclock' : 'regular',
        x: -pan.x + 350,
        y: -pan.y + 200,
        baseCycleTime: 1,
        baseOutputCount: isOC ? 8 : 2,
        basePowerConsumption: isOC ? 2.0 : 1.0,
        baseGoblins: isOC ? 2 : 1,
        actualCycleTime: 1,
        efficiency: 1.0,
        actualPower: isOC ? 2.0 : 1.0,
        actualGoblins: isOC ? 2 : 1,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: isOC ? [{ id: 'in-sludge', name: '虛空汙泥', type: 'solid', rateRequired: 0.2 }] : [],
        outputs: [{ id: `out-${fluidName}`, name: fluidName, type: 'fluid', rateProvided: isOC ? 8 : 2 }]
      };
    } else {
      // 環境池 (水池, 油池, 虛空裂隙)
      const fluid = subtype || '油池';
      node = {
        id,
        type: 'environment_pool',
        title: `環境資源：${fluid}`,
        x: -pan.x + 300,
        y: -pan.y + 150,
        baseCycleTime: 1,
        baseOutputCount: 999,
        basePowerConsumption: 0,
        baseGoblins: 0,
        actualCycleTime: 1,
        efficiency: 1.0,
        actualPower: 0,
        actualGoblins: 0,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs: [],
        outputs: [{ id: `out-env-${fluid}`, name: fluid.replace('池', ''), type: 'fluid', rateProvided: 999 }]
      };
    }

    setNodes(prev => [...prev, node]);
    setSelectedNodeId(id);
  };

  // ==========================================
  // 滑鼠互動：拖曳、平移與縮放
  // ==========================================
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialX: pan.x,
        initialY: pan.y
      };
      setSelectedNodeId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPan({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy
      });
    } else if (draggingNodeId) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      setNodes(prev => prev.map(n => {
        if (n.id === draggingNodeId) {
          return {
            ...n,
            x: dragStartRef.current.initialX + dx,
            y: dragStartRef.current.initialY + dy
          };
        }
        return n;
      }));
    } else if (connectingSource) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setConnectingSource(prev => prev ? {
          ...prev,
          currentX: (e.clientX - rect.left - pan.x) / zoom,
          currentY: (e.clientY - rect.top - pan.y) / zoom
        } : null);
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setConnectingSource(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(2.0, Math.max(0.4, prev * zoomFactor)));
  };

  const handleNodeSelect = (nodeId: string, e: React.MouseEvent) => {
    setSelectedNodeId(nodeId);
    setDraggingNodeId(nodeId);
    const targetNode = nodes.find(n => n.id === nodeId);
    if (targetNode) {
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialX: targetNode.x,
        initialY: targetNode.y
      };
    }
  };

  const handleDeleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.fromNodeId !== id && c.toNodeId !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleToggleMock = (id: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        return { ...n, isMockInfiniteSupply: !n.isMockInfiniteSupply };
      }
      return n;
    }));
  };

  // 連線起點拉出
  const handleStartConnect = (
    nodeId: string, 
    portId: string, 
    portType: 'solid' | 'fluid', 
    _isOutput: boolean, 
    e: React.MouseEvent
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = (e.clientX - rect.left - pan.x) / zoom;
    const startY = (e.clientY - rect.top - pan.y) / zoom;

    setConnectingSource({
      nodeId,
      portId,
      portType,
      startX,
      startY,
      currentX: startX,
      currentY: startY
    });
  };

  // 連線終點放開
  const handleEndConnect = (toNodeId: string, toPortId: string) => {
    if (!connectingSource) return;
    if (connectingSource.nodeId === toNodeId) return; // 避免自連

    const fromNode = nodes.find(n => n.id === connectingSource.nodeId);
    const toNode = nodes.find(n => n.id === toNodeId);
    if (!fromNode || !toNode) return;

    const outPort = fromNode.outputs.find(p => p.id === connectingSource.portId);
    const inPort = toNode.inputs.find(p => p.id === toPortId);
    if (!outPort || !inPort) return;

    // 檢查類型相容性 (solid 連 solid, fluid 連 fluid)
    if (outPort.type !== inPort.type) {
      alert(`⚠️ 端口類型不相容：無法將 ${outPort.type === 'fluid' ? '流體' : '固體'} 連接至 ${inPort.type === 'fluid' ? '流體' : '固體'} 端口！`);
      return;
    }

    // 檢查是否已存在相同連線
    const exists = connections.some(
      c => c.fromNodeId === fromNode.id && c.fromPortId === outPort.id && c.toNodeId === toNode.id && c.toPortId === inPort.id
    );
    if (exists) return;

    const newConnection: SandboxConnection = {
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      fromNodeId: fromNode.id,
      fromPortId: outPort.id,
      toNodeId: toNode.id,
      toPortId: inPort.id,
      itemOrFluidName: outPort.name,
      type: outPort.type,
      actualFlowRate: 0
    };

    setConnections(prev => [...prev, newConnection]);
    setConnectingSource(null);
  };

  // 刪除連線
  const handleDeleteConnection = (connId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnections(prev => prev.filter(c => c.id !== connId));
  };

  // 取得節點端口的畫布絕對座標
  const getPortCoordinates = (nodeId: string, portId: string, isOutput: boolean) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const nodeWidth = 288; // w-72 = 18rem = 288px
    const headerHeight = 44;
    const bodyHeight = 110;
    const portStartY = headerHeight + bodyHeight + 25;

    const ports = isOutput ? node.outputs : node.inputs;
    const portIndex = ports.findIndex(p => p.id === portId);
    const offsetY = portIndex >= 0 ? portIndex * 22 : 0;

    return {
      x: isOutput ? node.x + nodeWidth - 12 : node.x + 12,
      y: node.y + portStartY + offsetY
    };
  };

  return (
    <div className="flex h-[calc(100vh-140px)] w-full overflow-hidden bg-[#050b0e] rounded-3xl border border-[#1c2e38] shadow-2xl relative select-none">
      
      {/* ========================================================================= */}
      {/* 1. 左側可折疊物資庫 (純資料庫驅動，自適應未來任何新配方) */}
      {/* ========================================================================= */}
      <div className={`transition-all duration-300 z-20 flex flex-col border-r border-[#1c2e38] bg-[#0b1419]/95 backdrop-blur-xl ${
        isSidebarOpen ? 'w-80' : 'w-12'
      }`}>
        {/* 頂部切換與搜尋列 */}
        <div className="p-3 border-b border-[#1c2e38] flex items-center justify-between">
          {isSidebarOpen ? (
            <div className="flex-1 flex items-center justify-between space-x-2">
              <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>物資與設備庫</span>
              </span>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="text-xs p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg"
                title="收起選單"
              >
                ◀
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="mx-auto text-xs p-1 text-slate-400 hover:text-slate-200"
              title="展開物資庫"
            >
              ▶
            </button>
          )}
        </div>

        {isSidebarOpen && (
          <>
            {/* 分類標籤切換 */}
            <div className="flex border-b border-[#1c2e38] text-[11px] font-bold p-1 bg-slate-950/40">
              <button 
                onClick={() => setActiveCatalogTab('machines')}
                className={`flex-1 py-1.5 rounded-lg transition-colors ${activeCatalogTab === 'machines' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                機器設備
              </button>
              <button 
                onClick={() => setActiveCatalogTab('fluids')}
                className={`flex-1 py-1.5 rounded-lg transition-colors ${activeCatalogTab === 'fluids' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                流體/能源
              </button>
              <button 
                onClick={() => setActiveCatalogTab('recipes')}
                className={`flex-1 py-1.5 rounded-lg transition-colors ${activeCatalogTab === 'recipes' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                終端食譜
              </button>
            </div>

            {/* 搜尋欄 */}
            <div className="p-2 border-b border-[#1c2e38]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="搜尋設備、配方或原料..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#070e12] border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* 物資列表卡片區 (點擊即放置到畫布) */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 text-xs">
              {/* 分頁 1: 機器設備與中間配方 */}
              {activeCatalogTab === 'machines' && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">常用中間工序機台</div>
                  {intermediate
                    .filter(r => r.name.includes(searchQuery) || r.machine.includes(searchQuery))
                    .map(r => {
                      const mach = machines.find(m => m.name === r.machine) || { name: r.machine, power: 1.0, goblins: 1 };
                      return (
                        <div
                          key={r.name}
                          onClick={() => handleAddMachineWithRecipe(mach as Machine, r)}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-amber-500/50 cursor-pointer transition-all group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <ItemIcon name={r.name} size="sm" />
                            <div className="truncate">
                              <div className="font-bold text-slate-200 truncate group-hover:text-amber-300 transition-colors">
                                {r.name}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center space-x-1">
                                <span>{r.machine}</span>
                                <span>·</span>
                                <span>{r.cycleTime || 5}s/次</span>
                              </div>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0" />
                        </div>
                      );
                    })}
                </div>
              )}

              {/* 分頁 2: 流體環境池、外採泵機與電網 */}
              {activeCatalogTab === 'fluids' && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">⚡ 電網基礎設施</div>
                  <div 
                    onClick={() => handleAddInfrastructure('generator', 'regular')}
                    className="p-2 rounded-xl bg-[#14180e] hover:bg-[#1c2214] border border-amber-900/40 hover:border-amber-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-amber-300">虛空熔爐 (常規)</div>
                        <div className="text-[10px] text-slate-400">發電 4.0 FV/s · 吃煤炭 0.1/s</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                  </div>

                  <div 
                    onClick={() => handleAddInfrastructure('generator', 'overclock')}
                    className="p-2 rounded-xl bg-[#14180e] hover:bg-[#1c2214] border border-amber-900/40 hover:border-amber-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-amber-300" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-amber-300">虛空熔爐 (超頻)</div>
                        <div className="text-[10px] text-slate-400">發電 16.0 FV/s · 煤+汙泥 0.1/s</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                  </div>

                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">💧 外採泵機站</div>
                  {['水', '油', '虛空'].map(fluid => (
                    <div key={fluid} className="space-y-1">
                      <div 
                        onClick={() => handleAddInfrastructure('pump', fluid)}
                        className="p-2 rounded-xl bg-[#0e161c] hover:bg-[#132029] border border-cyan-900/40 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-2">
                          <Droplets className="w-4 h-4 text-cyan-400" />
                          <div>
                            <div className="font-bold text-slate-200 group-hover:text-cyan-300">常規{fluid}泵機 (2.0 fl/s)</div>
                            <div className="text-[10px] text-slate-400">能耗 1 FV/s · 1 妖精</div>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                      </div>
                    </div>
                  ))}

                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">🏞️ 環境池節點 (注入機原位轉化)</div>
                  {['油池', '水池', '虛空裂隙'].map(pool => (
                    <div 
                      key={pool}
                      onClick={() => handleAddInfrastructure('environment_pool', pool)}
                      className="p-2 rounded-xl bg-[#091517] hover:bg-[#0f1f22] border border-teal-900/40 hover:border-teal-500/50 cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2">
                        <Droplets className="w-4 h-4 text-teal-400" />
                        <div>
                          <div className="font-bold text-slate-200 group-hover:text-teal-300">{pool}</div>
                          <div className="text-[10px] text-slate-400">環境底料，支援原位轉化</div>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-slate-500 group-hover:text-teal-400" />
                    </div>
                  ))}
                </div>
              )}

              {/* 分頁 3: 終端料理自動廚師機 */}
              {activeCatalogTab === 'recipes' && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">終端組裝料理</div>
                  {recipes
                    .filter(r => r.name.includes(searchQuery))
                    .map(r => {
                      const mach = machines.find(m => m.name === '自動廚師機') || { name: '自動廚師機', power: 1.0, goblins: 3 };
                      return (
                        <div
                          key={r.name}
                          onClick={() => handleAddMachineWithRecipe(mach as Machine, r)}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-amber-500/50 cursor-pointer transition-all group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <ItemIcon name={r.name} size="sm" />
                            <div className="truncate">
                              <div className="font-bold text-slate-200 truncate group-hover:text-amber-300 transition-colors">
                                {r.name}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                自動廚師機 · 5s/份
                              </div>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0" />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. 中央無限畫布 (Canvas / Node Graph) */}
      {/* ========================================================================= */}
      <div 
        ref={canvasRef}
        className="flex-1 relative overflow-hidden bg-[#070d10] cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* 背景網格點 */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#3a5060 1px, transparent 1px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
        />

        {/* 畫布平移與縮放容器 */}
        <div 
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* SVG 連線層 */}
          <svg className="absolute inset-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none">
            <defs>
              <linearGradient id="solidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="fluidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>

            {/* 已建立的連線 */}
            {updatedConnections.map(c => {
              const start = getPortCoordinates(c.fromNodeId, c.fromPortId, true);
              const end = getPortCoordinates(c.toNodeId, c.toPortId, false);
              const dx = Math.abs(end.x - start.x) * 0.5;
              const pathD = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

              return (
                <g key={c.id} className="pointer-events-auto group/conn cursor-pointer">
                  {/* 粗邊熱區方便點擊刪除 */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    onClick={(e) => handleDeleteConnection(c.id, e)}
                  />
                  {/* 實質導線 */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={c.type === 'fluid' ? '#06b6d4' : '#10b981'}
                    strokeWidth={2.5}
                    strokeDasharray={c.actualFlowRate > 0 ? "5,3" : "none"}
                    className="transition-all group-hover/conn:stroke-rose-400 group-hover/conn:stroke-[4]"
                  />
                  {/* 流量標籤 */}
                  <foreignObject
                    x={(start.x + end.x) / 2 - 40}
                    y={(start.y + end.y) / 2 - 12}
                    width={80}
                    height={24}
                    className="overflow-visible pointer-events-none"
                  >
                    <div className="px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-[10px] text-center font-mono font-bold text-slate-300 whitespace-nowrap shadow-md">
                      {c.actualFlowRate.toFixed(2)} {c.type === 'fluid' ? 'fl/s' : '/s'}
                    </div>
                  </foreignObject>
                </g>
              );
            })}

            {/* 正在拉線中的臨時虛線 */}
            {connectingSource && (
              <path
                d={`M ${connectingSource.startX} ${connectingSource.startY} C ${connectingSource.startX + 50} ${connectingSource.startY}, ${connectingSource.currentX - 50} ${connectingSource.currentY}, ${connectingSource.currentX} ${connectingSource.currentY}`}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2.5}
                strokeDasharray="4,4"
              />
            )}
          </svg>

          {/* 節點卡片層 */}
          <div className="pointer-events-auto">
            {updatedNodes.map(node => (
              <SandboxNode
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                onSelect={handleNodeSelect}
                onDelete={handleDeleteNode}
                onToggleMock={handleToggleMock}
                onStartConnect={handleStartConnect}
                onEndConnect={handleEndConnect}
              />
            ))}
          </div>
        </div>

        {/* 畫布左下角浮動工具按鈕 (重置視角 / 縮放) */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-800 text-xs text-slate-300 shadow-xl">
          <button 
            onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}
            className="p-1 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center space-x-1"
            title="視角回正"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>重置視角</span>
          </button>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-slate-400">{(zoom * 100).toFixed(0)}%</span>
          <span className="text-slate-600">|</span>
          <button 
            onClick={() => {
              if (window.confirm('確定要清空畫布上的所有機台與管線嗎？')) {
                setNodes([]);
                setConnections([]);
              }
            }}
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
            title="清空畫布"
          >
            清空畫布
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 右側即時物理監控儀表板 (電網、流體盈虧、出餐效率) */}
      {/* ========================================================================= */}
      <div className="w-80 border-l border-[#1c2e38] bg-[#0b1419]/95 backdrop-blur-xl flex flex-col z-20">
        <div className="p-3.5 border-b border-[#1c2e38] flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>全廠即時物理監控</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#14232a] text-teal-300 border border-teal-500/30">
            {metrics.machineCount} 台機
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
          
          {/* (1) 即時電網監控 */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 flex items-center space-x-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>即時連續電網</span>
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                metrics.powerBalance >= 0 
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' 
                  : 'bg-rose-950 text-rose-300 border border-rose-800/60'
              }`}>
                {metrics.powerBalance >= 0 ? '電網穩定' : '⚠️ 嚴重跳電'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-[#121c22] p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">總發電量</div>
                <div className="text-base font-bold text-amber-300">+{metrics.totalPowerGen} <span className="text-[10px] font-normal text-slate-500">FV/s</span></div>
              </div>
              <div className="bg-[#121c22] p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">總負載</div>
                <div className="text-base font-bold text-slate-200">{metrics.totalPowerLoad} <span className="text-[10px] font-normal text-slate-500">FV/s</span></div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60">
              <span className="text-slate-400">電網淨盈餘</span>
              <span className={`font-mono font-bold ${metrics.powerBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.powerBalance > 0 ? `+${metrics.powerBalance}` : metrics.powerBalance} FV/s
              </span>
            </div>
          </div>

          {/* (2) 小妖精勞動力 */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-teal-400" />
              <div>
                <div className="font-bold text-slate-300">打工小妖精需求</div>
                <div className="text-[10px] text-slate-500">全廠運作所需妖精總額</div>
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-teal-300">
              {metrics.totalGoblins} <span className="text-xs font-normal text-slate-400">隻</span>
            </div>
          </div>

          {/* (3) 連續流體平衡 */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="font-bold text-slate-300 flex items-center space-x-1">
              <Droplets className="w-3.5 h-3.5 text-cyan-400" />
              <span>全廠連續流體產銷</span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              {/* 水 */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">供水 (fl/s)</span>
                <span className="font-mono text-slate-200">
                  <span className="text-cyan-400">{metrics.fluidsSummary.water.produced.toFixed(1)}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-slate-400">{metrics.fluidsSummary.water.consumed.toFixed(1)} 需</span>
                </span>
              </div>
              {/* 油 */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">供油 (fl/s)</span>
                <span className="font-mono text-slate-200">
                  <span className="text-amber-400">{metrics.fluidsSummary.oil.produced.toFixed(1)}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-slate-400">{metrics.fluidsSummary.oil.consumed.toFixed(1)} 需</span>
                </span>
              </div>
              {/* 虛空 */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">虛空流體</span>
                <span className="font-mono text-slate-200">
                  <span className="text-purple-400">{metrics.fluidsSummary.void.produced.toFixed(1)}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-slate-400">{metrics.fluidsSummary.void.consumed.toFixed(1)} 需</span>
                </span>
              </div>
              {/* 衍生流體 (如炙烈紅油, 醋) */}
              {Object.entries(metrics.fluidsSummary.custom).map(([fName, val]) => (
                <div key={fName} className="flex items-center justify-between">
                  <span className="text-rose-300">{fName}</span>
                  <span className="font-mono text-slate-200">
                    <span className="text-rose-400">{val.produced.toFixed(1)}</span>
                    <span className="text-slate-600"> / </span>
                    <span className="text-slate-400">{val.consumed.toFixed(1)} 需</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* (4) 終端料理出餐檢測 */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="font-bold text-slate-300 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>終端料理出餐統計</span>
            </div>

            {metrics.terminalDishes.length === 0 ? (
              <div className="text-[10px] text-slate-500 italic py-1 text-center">
                尚未放置自動廚師機
              </div>
            ) : (
              metrics.terminalDishes.map((dish, i) => (
                <div key={i} className="p-2 rounded-xl bg-[#121c22] border border-slate-800 flex items-center justify-between">
                  <div className="truncate">
                    <div className="font-bold text-slate-200 truncate">{dish.dishName}</div>
                    <div className="text-[10px] text-slate-400">稼動率 {dish.efficiency}%</div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <div className="font-bold text-amber-300">{dish.ratePerMin}</div>
                    <div className="text-[9px] text-slate-500">份 / 分</div>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>

    </div>
  );
};
