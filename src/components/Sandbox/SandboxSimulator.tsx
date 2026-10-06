import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  SandboxNodeData, 
  SandboxConnection,
  PortDefinition,
  SandboxBlueprint
} from './sandboxTypes';
import { simulateSandboxPhysics, isItemMatch, normalizeItemName } from './sandboxPhysics';
import { SandboxNode } from './SandboxNode';
import { SandboxBlueprintModal } from './SandboxBlueprintModal';
import { sandboxBlueprintService } from '../../services/sandboxBlueprintService';
import { Machine, Item, IntermediateRecipe, Recipe } from '../../types';
import { isScorchingDish } from '../../services/solver';
import { ItemIcon } from '../Common/ItemIcon';
import { 
  Zap, 
  Users, 
  Droplets, 
  Plus, 
  Search, 
  Compass, 
  Sparkles, 
  Layers, 
  Flame,
  Pickaxe,
  GitFork,
  Hourglass,
  FolderKanban,
  Save,
  Cloud
} from 'lucide-react';

interface SandboxSimulatorProps {
  machines: Machine[];
  items: Item[];
  intermediate: IntermediateRecipe[];
  recipes: Recipe[];
}

// 全遊戲真正的連續管網流體 (fl/s) 精準集合
const TRUE_FLUID_NAMES = new Set([
  '水', '油', '虛空',
  '塔瑪茄醬', '青醬', '麵糊', '白醬', '肉汁', '蟑螂奶', '蒜泥蛋醬',
  '炙烈紅油', '醋', '致命莎莎醬'
]);

function isFluidItem(name: string, itemsList?: Item[]): boolean {
  if (!name) return false;
  if (TRUE_FLUID_NAMES.has(name)) return true;
  if (itemsList) {
    const item = itemsList.find(i => i.name === name);
    if (item && item.isFluid !== undefined) return Boolean(item.isFluid);
  }
  return false;
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
      try {
        const parsed: SandboxNodeData[] = JSON.parse(saved);
        // 自動校準既有節點的端口型別 (防止舊版快取將固體標記為 fluid)
        return parsed.map(n => ({
          ...n,
          outputs: n.outputs.map(p => ({
            ...p,
            type: isFluidItem(p.name, items) || n.machineName === '注入機' ? 'fluid' : 'solid'
          }))
        }));
      } catch (e) { /* ignore */ }
    }
    // 預設樣板：1 台發電熔爐 + 1 台採煤機 + 1 台水泵 + 1 台煮鍋 (示範新手開局)
    return [
      {
        id: 'gen-1',
        type: 'generator',
        title: '虛空熔爐 (常規發電)',
        machineName: '虛空熔爐',
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
  const [itemsFilter, setItemsFilter] = useState<'all' | 'miner' | 'harvester' | 'reconstructor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [defaultDishRateMin, setDefaultDishRateMin] = useState<number>(12);

  // 產線專案 (Blueprint) 狀態
  const [currentBlueprintId, setCurrentBlueprintId] = useState<string | null>(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('snacktorio_current_blueprint_id_v1') || null : null;
  });
  const [currentBlueprintName, setCurrentBlueprintName] = useState<string>(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('snacktorio_current_blueprint_name_v1') || '未命名產線' : '未命名產線';
  });
  const [isBlueprintModalOpen, setIsBlueprintModalOpen] = useState(false);
  const [quickSaveFeedback, setQuickSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    if (currentBlueprintId) {
      localStorage.setItem('snacktorio_current_blueprint_id_v1', currentBlueprintId);
    } else {
      localStorage.removeItem('snacktorio_current_blueprint_id_v1');
    }
    localStorage.setItem('snacktorio_current_blueprint_name_v1', currentBlueprintName);
  }, [currentBlueprintId, currentBlueprintName]);

  // 滑鼠互動狀態 (拖曳節點、拖曳畫布、拉線)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // 拉線中狀態 (支援自輸出端口或自輸入端口雙向拉出)
  const [connectingSource, setConnectingSource] = useState<{
    nodeId: string;
    portId: string;
    portType: 'solid' | 'fluid';
    isOutput: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // 邊緣自動推鏡頭 (Auto-Pan) 與即時座標同步 Ref
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const connectingSourceRef = useRef(connectingSource);
  connectingSourceRef.current = connectingSource;
  const draggingNodeIdRef = useRef(draggingNodeId);
  draggingNodeIdRef.current = draggingNodeId;

  const autoPanVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const autoPanAnimationRef = useRef<number | null>(null);
  const lastMousePosRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });

  const stopAutoPan = useCallback(() => {
    if (autoPanAnimationRef.current) {
      cancelAnimationFrame(autoPanAnimationRef.current);
      autoPanAnimationRef.current = null;
    }
    autoPanVelocityRef.current = { vx: 0, vy: 0 };
  }, []);

  const startAutoPan = useCallback(() => {
    if (autoPanAnimationRef.current) return;

    const loop = () => {
      const { vx, vy } = autoPanVelocityRef.current;
      if (vx === 0 && vy === 0) {
        autoPanAnimationRef.current = null;
        return;
      }

      setPan(prev => {
        const nextX = prev.x + vx;
        const nextY = prev.y + vy;
        panRef.current = { x: nextX, y: nextY };

        // 同步刷新拉線頂端座標，確保拉線末端精準跟隨滑鼠游標
        if (connectingSourceRef.current && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const { clientX, clientY } = lastMousePosRef.current;
          const curX = (clientX - rect.left - nextX) / zoomRef.current;
          const curY = (clientY - rect.top - nextY) / zoomRef.current;
          setConnectingSource(prevSrc => prevSrc ? {
            ...prevSrc,
            currentX: curX,
            currentY: curY
          } : null);
        }

        return { x: nextX, y: nextY };
      });

      autoPanAnimationRef.current = requestAnimationFrame(loop);
    };

    autoPanAnimationRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      stopAutoPan();
      setIsPanning(false);
      setDraggingNodeId(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', stopAutoPan);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', stopAutoPan);
      stopAutoPan();
    };
  }, [stopAutoPan]);

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

  // 快速存檔 (覆寫當前專案或若無則開啟專案庫儲存)
  const handleQuickSave = useCallback(() => {
    if (currentBlueprintId) {
      const updated = sandboxBlueprintService.saveBlueprint({
        name: currentBlueprintName,
        nodes,
        connections,
        pan,
        zoom,
        existingId: currentBlueprintId
      });
      setQuickSaveFeedback(`已儲存「${updated.name}」！`);
      setTimeout(() => setQuickSaveFeedback(null), 3000);
    } else {
      setIsBlueprintModalOpen(true);
    }
  }, [currentBlueprintId, currentBlueprintName, nodes, connections, pan, zoom]);

  // 鍵盤 Ctrl+S / Cmd+S 快速存檔監聽
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleQuickSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleQuickSave]);

  // 載入專案
  const handleLoadBlueprint = useCallback((bp: SandboxBlueprint) => {
    setNodes(bp.nodes);
    setConnections(bp.connections);
    if (bp.pan) setPan(bp.pan);
    if (bp.zoom) setZoom(bp.zoom);
    setCurrentBlueprintId(bp.id);
    setCurrentBlueprintName(bp.name);
    setQuickSaveFeedback(`已載入「${bp.name}」！`);
    setTimeout(() => setQuickSaveFeedback(null), 3000);
  }, []);

  // 另存/儲存成功回調
  const handleSaveCurrentSuccess = useCallback((bp: SandboxBlueprint) => {
    setCurrentBlueprintId(bp.id);
    setCurrentBlueprintName(bp.name);
    setQuickSaveFeedback(`已成功儲存「${bp.name}」！`);
    setTimeout(() => setQuickSaveFeedback(null), 3000);
  }, []);

  // ==========================================
  // 終端料理產能換算與炙熱菜餚連動引擎
  // ==========================================
  const configureDishNodeRates = useCallback((
    node: SandboxNodeData,
    targetRatePerMin: number,
    recipe: Recipe,
    mach: Machine
  ): SandboxNodeData => {
    const outputCount = recipe.outputCount || 1;
    const cycleTime = recipe.cycleTime || 5;
    const singleRate = outputCount / cycleTime; // 單台廚師機產率 (份/秒)
    const targetPerSec = targetRatePerMin / 60; // 目標產率 (份/秒)
    const machineMultiplier = targetPerSec / singleRate;

    // 固體輸入端口需求換算
    const inputs: SandboxNodeData['inputs'] = [];
    (recipe.inputs || []).forEach((inp, idx) => {
      if (inp.name && !inp.name.startsWith('無') && inp.count > 0) {
        const rateReq = Number(((inp.count / outputCount) * targetPerSec).toFixed(3));
        inputs.push({
          id: `in-${idx}-${inp.name}`,
          name: inp.name,
          type: 'solid',
          rateRequired: rateReq
        });
      }
    });

    // 連續流體需求換算
    if (recipe.fluidType && recipe.fluidType !== '無') {
      const fluidReq = Number(((recipe.fluidRate || 1.0) * machineMultiplier).toFixed(3));
      inputs.push({
        id: `in-fluid-${recipe.fluidType}`,
        name: recipe.fluidType,
        type: 'fluid',
        rateRequired: fluidReq
      });
    }

    // 終端輸出端口產率
    const outputs: SandboxNodeData['outputs'] = [{
      id: `out-${recipe.name}`,
      name: recipe.name,
      type: 'solid',
      rateProvided: Number(targetPerSec.toFixed(3))
    }];

    return {
      ...node,
      targetRatePerMin,
      basePowerConsumption: Number((mach.power * machineMultiplier).toFixed(2)),
      baseGoblins: Math.max(1, Math.round(mach.goblins * machineMultiplier)),
      inputs,
      outputs
    };
  }, []);

  // 動態同步全廠炙熱菜餚總和產能至【胃復慘】終端方塊
  const syncAutoPeptoNodes = useCallback((currentNodes: SandboxNodeData[]): SandboxNodeData[] => {
    // 找出畫布上所有炙熱菜餚
    const scorchingNodes = currentNodes.filter(n => 
      n.type === 'machine' && 
      n.recipeName && 
      isScorchingDish(n.recipeName, items, recipes)
    );
    const totalScorchingRate = scorchingNodes.reduce((sum, n) => sum + (n.targetRatePerMin || 12), 0);

    const peptoRecipe = recipes.find(r => r.name === '胃復慘');
    const chefMach = machines.find(m => m.name === '自動廚師機') || { name: '自動廚師機', power: 1.0, goblins: 3 };

    return currentNodes.map(node => {
      if (node.recipeName === '胃復慘' && (node.isAutoPepto || node.autoPeptoTrackingRate !== undefined)) {
        if (totalScorchingRate > 0 && peptoRecipe) {
          const updated = configureDishNodeRates(node, totalScorchingRate, peptoRecipe, chefMach as Machine);
          return {
            ...updated,
            autoPeptoTrackingRate: totalScorchingRate,
            statusNote: `🌶️ 隨 ${scorchingNodes.length} 道炙熱菜餚連動 (總和 ${totalScorchingRate} 份/分)`
          };
        } else {
          return {
            ...node,
            autoPeptoTrackingRate: 0,
            statusNote: '⚠️ 畫布上無炙熱菜餚連動'
          };
        }
      }
      return node;
    });
  }, [items, recipes, machines, configureDishNodeRates]);

  // ==========================================
  // 節點生成工廠 (純資料庫驅動，自適應未來任何新配方)
  // ==========================================
  const handleAddMachineWithRecipe = (mach: Machine, recipeOrInter?: IntermediateRecipe | Recipe) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    // 解析輸入端口
    const inputs: SandboxNodeData['inputs'] = [];
    if (recipeOrInter) {
      (recipeOrInter.inputs || []).forEach((inp, idx) => {
        if (inp.name && !inp.name.startsWith('無') && inp.count > 0) {
          inputs.push({
            id: `in-${idx}-${inp.name}`,
            name: inp.name,
            type: 'solid',
            rateRequired: Number((inp.count / (recipeOrInter.cycleTime || 5)).toFixed(3))
          });
        }
      });
      // 注入機為環境原位轉化設備，直接置於池中，不需要外採管道供水/供油！
      if (recipeOrInter.fluidType && recipeOrInter.fluidType !== '無' && mach.name !== '注入機') {
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
      const isOutFluid = isFluidItem(recipeOrInter.name, items) || mach.name === '注入機';
      const rate = mach.name === '注入機'
        ? 999
        : isOutFluid
          ? (recipeOrInter.outputCount && recipeOrInter.cycleTime ? recipeOrInter.outputCount / recipeOrInter.cycleTime : 1.0)
          : ((recipeOrInter.outputCount || 1) / (recipeOrInter.cycleTime || 5));

      outputs.push({
        id: `out-${recipeOrInter.name}`,
        name: recipeOrInter.name,
        type: isOutFluid ? 'fluid' : 'solid',
        rateProvided: Number(rate.toFixed(3))
      });
    }

    const rawNode: SandboxNodeData = {
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

    const isDish = recipeOrInter && recipes.some(r => r.name === recipeOrInter.name);
    let finalNewNode = rawNode;

    if (isDish && recipeOrInter) {
      finalNewNode = configureDishNodeRates(rawNode, defaultDishRateMin, recipeOrInter as Recipe, mach);
    }

    // 若為炙熱料理，自動加入胃復慘終端方塊並動態連動產能！
    if (isDish && recipeOrInter && isScorchingDish(recipeOrInter.name, items, recipes)) {
      const hasPepto = nodes.some(n => n.recipeName === '胃復慘');
      if (!hasPepto) {
        const peptoRecipe = recipes.find(r => r.name === '胃復慘');
        const chefMach = machines.find(m => m.name === '自動廚師機') || { name: '自動廚師機', power: 1.0, goblins: 3 };
        if (peptoRecipe) {
          const peptoId = `node-pepto-${Date.now()}`;
          const peptoRawNode: SandboxNodeData = {
            id: peptoId,
            type: 'machine',
            title: '胃復慘',
            machineName: '自動廚師機',
            recipeName: '胃復慘',
            island: '斯科瓦拉',
            x: finalNewNode.x + 30,
            y: finalNewNode.y + 240,
            baseCycleTime: 5,
            baseOutputCount: 10,
            basePowerConsumption: 1.0,
            baseGoblins: 3,
            actualCycleTime: 5,
            efficiency: 1.0,
            actualPower: 1.0,
            actualGoblins: 3,
            fluidSaturation: 1.0,
            solidSaturation: 1.0,
            isAutoPepto: true,
            inputs: [],
            outputs: []
          };
          const peptoNode = configureDishNodeRates(peptoRawNode, defaultDishRateMin, peptoRecipe, chefMach as Machine);
          setNodes(prev => syncAutoPeptoNodes([...prev, finalNewNode, peptoNode]));
          setSelectedNodeId(finalNewNode.id);
          return;
        }
      }
    }

    setNodes(prev => syncAutoPeptoNodes([...prev, finalNewNode]));
    setSelectedNodeId(finalNewNode.id);
  };

  const handleAddItemHarvester = (item: Item) => {
    const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    // 依據資料庫 source 與物理特性，精準匹配實體設備
    let machName = '收割機';
    let titlePrefix = '採收';
    let baseInputs: SandboxNodeData['inputs'] = [];
    let outCount = 1;
    let cycleTime = 5;

    const isReconstructor = item.source === '物質操縱機' || ['泥沼蟑螂', '綠色史萊姆', '巫妖骸骨', '粉紅仙子', '鷹身女妖翅膀', '虛空汙泥'].includes(item.name);
    const isMiner = item.source === '採掘機' || item.source === '採掘機直接開採' || ['煤炭', '鹽', '鐵礦石', '黏土', '豆肉蔻', '香豆蔻'].includes(item.name);

    if (isReconstructor) {
      machName = '物質操縱機';
      outCount = item.name === '泥沼蟑螂' ? 2 : 1;
      if (item.name === '虛空汙泥') {
        titlePrefix = '空載凝結';
        baseInputs = [
          { id: 'in-void', name: '虛空', type: 'fluid', rateRequired: 1.0 }
        ];
      } else {
        titlePrefix = '重構';
        baseInputs = [
          { id: 'in-base', name: '任意物品', type: 'solid', rateRequired: 0.2 },
          { id: 'in-void', name: '虛空', type: 'fluid', rateRequired: 1.0 }
        ];
      }
    } else if (isMiner) {
      machName = '採掘機';
      titlePrefix = '開採';
      baseInputs = [];
    } else {
      machName = '收割機';
      titlePrefix = '採收';
      baseInputs = [];
    }

    const mach = machines.find(m => m.name === machName) || { name: machName, power: 1.0, goblins: 1 };
    const outRate = Number((outCount / cycleTime).toFixed(3));

    const newNode: SandboxNodeData = {
      id,
      type: 'machine',
      title: `${titlePrefix}：${item.name}`,
      machineName: machName,
      island: item.island,
      x: -pan.x + 350 + Math.random() * 60,
      y: -pan.y + 200 + Math.random() * 60,
      baseCycleTime: cycleTime,
      baseOutputCount: outCount,
      basePowerConsumption: mach.power,
      baseGoblins: mach.goblins,
      actualCycleTime: cycleTime,
      efficiency: 1.0,
      actualPower: mach.power,
      actualGoblins: mach.goblins,
      fluidSaturation: 1.0,
      solidSaturation: 1.0,
      inputs: baseInputs,
      outputs: [
        {
          id: `out-${item.name}`,
          name: item.name,
          type: 'solid',
          rateProvided: outRate
        }
      ]
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const handleAddInfrastructure = (type: 'generator' | 'pump' | 'environment_pool' | 'splitter' | 'buffer_decay', subtype?: string) => {
    const id = `infra-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    let node: SandboxNodeData;

    if (type === 'generator') {
      node = {
        id,
        type: 'generator',
        title: subtype === 'overclock' ? '虛空熔爐 (超頻發電 16 FV/s)' : '虛空熔爐 (常規發電 4 FV/s)',
        machineName: '虛空熔爐',
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
      const isGeneric = subtype === 'generic' || !subtype;
      const fluidName = isGeneric ? '通用流體' : subtype;
      
      const inputs: PortDefinition[] = [];
      if (isGeneric) {
        inputs.push({
          id: 'in-fluid',
          name: '原位轉化液/環境池',
          type: 'fluid',
          rateRequired: 2.0
        });
      }
      // 統一配備虛空汙泥超頻端口 (可選輸入，供汙泥自動升級為 8.0 fl/s)
      inputs.push({
        id: 'in-sludge',
        name: '虛空汙泥 (超頻)',
        type: 'solid',
        rateRequired: 0.2
      });

      node = {
        id,
        type: 'pump',
        title: isGeneric ? '通用抽取泵機 (待接液源)' : `${fluidName}抽取泵機 (常規 2 fl/s)`,
        machineName: '虛空泵機',
        powerMode: 'regular',
        x: -pan.x + 350,
        y: -pan.y + 200,
        baseCycleTime: 1,
        baseOutputCount: 2,
        basePowerConsumption: 1.0,
        baseGoblins: 1,
        actualCycleTime: 1,
        efficiency: isGeneric ? 0 : 1.0,
        actualPower: 1.0,
        actualGoblins: 1,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        statusNote: isGeneric ? '⚠️ 待連接原位轉化液或環境池' : '正常運轉中 (常規 2.0 fl/s)',
        inputs,
        outputs: [
          {
            id: 'out-fluid',
            name: isGeneric ? '流體' : fluidName,
            type: 'fluid',
            rateProvided: isGeneric ? 0 : 2.0
          }
        ]
      };
    } else if (type === 'splitter') {
      node = {
        id,
        type: 'splitter',
        title: '物品分流器 (待進料)',
        machineName: '分流器',
        x: -pan.x + 350,
        y: -pan.y + 200,
        baseCycleTime: 0,
        baseOutputCount: 1,
        basePowerConsumption: 0,
        baseGoblins: 0,
        actualCycleTime: 0,
        efficiency: 0,
        actualPower: 0,
        actualGoblins: 0,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        statusNote: '⚠️ 待連接輸入物料',
        splitterMode: 'equal',
        splitterRatios: [1, 1],
        inputs: [
          { id: 'in-item', name: '待分流物料', type: 'solid' }
        ],
        outputs: [
          { id: 'out-item-1', name: '分流A (50%)', type: 'solid', rateProvided: 0 },
          { id: 'out-item-2', name: '分流B (50%)', type: 'solid', rateProvided: 0 }
        ]
      };
    } else if (type === ('buffer_decay' as any)) {
      // 發酵變質 / 輸送緩衝方塊 (支援指定變質物或泛用緩衝)
      const perishItem = subtype ? items.find(i => i.name === subtype) : null;
      const rawName = perishItem?.name || '發酵原料';
      const prodName = perishItem?.spoilProduct || '熟成產物';
      const spoilSeconds = Number(perishItem?.spoilTime) || 15;

      node = {
        id,
        type: 'buffer_decay',
        title: perishItem ? `發酵：${rawName} ➔ ${prodName}` : '發酵變質緩衝方塊',
        machineName: '發酵緩衝',
        recipeName: prodName,
        x: -pan.x + 350,
        y: -pan.y + 200,
        baseCycleTime: spoilSeconds,
        baseOutputCount: 1,
        basePowerConsumption: 0,
        baseGoblins: 0,
        actualCycleTime: spoilSeconds,
        efficiency: 0,
        actualPower: 0,
        actualGoblins: 0,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        statusNote: `⏳ 發酵需時 ${spoilSeconds}s (傳送帶長度 ≥ ${spoilSeconds} 格)`,
        inputs: [
          { id: 'in-raw', name: rawName, type: 'solid', rateRequired: 0.2 }
        ],
        outputs: [
          { id: 'out-spoiled', name: prodName, type: 'solid', rateProvided: 0 }
        ]
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
    // 支援中鍵 (button === 1)、右鍵 (button === 2) 或左鍵點擊背景平移畫布
    if (e.button === 1 || e.button === 2 || e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialX: pan.x,
        initialY: pan.y
      };
      if (e.button === 0) {
        setSelectedNodeId(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };

    // 支援中鍵 (buttons & 4) 或右鍵 (buttons & 2) 隨時拖曳平移 (即便正在拉線或拖曳)
    if ((e.buttons & 4) || (e.buttons & 2)) {
      setPan(prev => {
        const nextX = prev.x + e.movementX;
        const nextY = prev.y + e.movementY;
        panRef.current = { x: nextX, y: nextY };
        return { x: nextX, y: nextY };
      });
      if (connectingSource) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setConnectingSource(prev => prev ? {
            ...prev,
            currentX: (e.clientX - rect.left - (pan.x + e.movementX)) / zoom,
            currentY: (e.clientY - rect.top - (pan.y + e.movementY)) / zoom
          } : null);
        }
      }
      return;
    }

    if (isPanning) {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPan({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy
      });
      panRef.current = {
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy
      };
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

    // 邊緣自動推鏡頭 (Auto-Pan)：拉線或拖曳節點時游標靠近邊界 80px 自動平移
    if (connectingSource || draggingNodeId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const margin = 80;
        const maxSpeed = 15;

        let vx = 0;
        let vy = 0;

        if (mouseX >= 0 && mouseX < margin) {
          vx = maxSpeed * Math.pow((margin - mouseX) / margin, 1.2);
        } else if (mouseX <= rect.width && mouseX > rect.width - margin) {
          vx = -maxSpeed * Math.pow((margin - (rect.width - mouseX)) / margin, 1.2);
        }

        if (mouseY >= 0 && mouseY < margin) {
          vy = maxSpeed * Math.pow((margin - mouseY) / margin, 1.2);
        } else if (mouseY <= rect.height && mouseY > rect.height - margin) {
          vy = -maxSpeed * Math.pow((margin - (rect.height - mouseY)) / margin, 1.2);
        }

        autoPanVelocityRef.current = { vx, vy };

        if ((vx !== 0 || vy !== 0) && !autoPanAnimationRef.current) {
          startAutoPan();
        } else if (vx === 0 && vy === 0 && autoPanAnimationRef.current) {
          stopAutoPan();
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setConnectingSource(null);
    stopAutoPan();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Shift + 滾輪：水平平移畫布
    if (e.shiftKey) {
      setPan(prev => {
        const next = { x: prev.x - e.deltaY, y: prev.y };
        panRef.current = next;
        return next;
      });
      return;
    }

    // 以滑鼠游標為錨點縮放 (Zoom toward mouse pointer)
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(2.0, Math.max(0.4, zoom * zoomFactor));

    const mouseCanvasX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseCanvasY = (e.clientY - rect.top - pan.y) / zoom;

    const newPanX = e.clientX - rect.left - mouseCanvasX * newZoom;
    const newPanY = e.clientY - rect.top - mouseCanvasY * newZoom;

    setZoom(newZoom);
    zoomRef.current = newZoom;
    setPan({ x: newPanX, y: newPanY });
    panRef.current = { x: newPanX, y: newPanY };

    if (connectingSource) {
      setConnectingSource(prev => prev ? {
        ...prev,
        currentX: mouseCanvasX,
        currentY: mouseCanvasY
      } : null);
    }
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
    setNodes(prev => {
      const remaining = prev.filter(n => n.id !== id);
      return syncAutoPeptoNodes(remaining);
    });
    setConnections(prev => prev.filter(c => c.fromNodeId !== id && c.toNodeId !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleUpdateDishTargetRate = useCallback((nodeId: string, rateMin: number) => {
    setNodes(prev => {
      const next = prev.map(node => {
        if (node.id === nodeId) {
          const rec = recipes.find(r => r.name === node.recipeName);
          const mach = machines.find(m => m.name === (node.machineName || '自動廚師機')) || { name: '自動廚師機', power: 1.0, goblins: 3 };
          if (rec) {
            return configureDishNodeRates(node, rateMin, rec, mach as Machine);
          }
          return { ...node, targetRatePerMin: rateMin };
        }
        return node;
      });
      return syncAutoPeptoNodes(next);
    });
  }, [recipes, machines, configureDishNodeRates, syncAutoPeptoNodes]);

  const handleToggleMock = (id: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        return { ...n, isMockInfiniteSupply: !n.isMockInfiniteSupply };
      }
      return n;
    }));
  };

  const handleUpdateNode = (id: string, updates: Partial<SandboxNodeData>) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        return { ...n, ...updates };
      }
      return n;
    }));
  };

  // 連線起點拉出 (支援自輸出端口或自輸入端口雙向拉出)
  const handleStartConnect = (
    nodeId: string, 
    portId: string, 
    portType: 'solid' | 'fluid', 
    isOutput: boolean, 
    e: React.MouseEvent
  ) => {
    const coords = getPortCoordinates(nodeId, portId, isOutput);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = (e.clientX - rect.left - pan.x) / zoom;
    const currentY = (e.clientY - rect.top - pan.y) / zoom;

    setConnectingSource({
      nodeId,
      portId,
      portType,
      isOutput,
      startX: coords.x,
      startY: coords.y,
      currentX,
      currentY
    });
  };

  // 連線終點放開 (雙向對接：無論先拉輸出端或先拉輸入端，皆可自動接合)
  const handleEndConnect = (
    targetNodeId: string, 
    targetPortId: string, 
    targetIsOutput: boolean
  ) => {
    if (!connectingSource) return;
    stopAutoPan();

    if (connectingSource.nodeId === targetNodeId) {
      setConnectingSource(null);
      return; // 避免自連
    }

    // 檢查方向：不能輸出接輸出、輸入接輸入
    if (connectingSource.isOutput === targetIsOutput) {
      alert(
        connectingSource.isOutput
          ? '⚠️ 端口連接錯誤：不能將「輸出端口」連接至另一個「輸出端口」！請連接至目標機台的「輸入端」。'
          : '⚠️ 端口連接錯誤：不能將「輸入端口」連接至另一個「輸入端口」！請連接至來源機台的「輸出端」。'
      );
      setConnectingSource(null);
      return;
    }

    // 辨別實體供需方向：無論先拉哪端，統一規整為 from (輸出端) -> to (輸入端)
    const fromNodeId = connectingSource.isOutput ? connectingSource.nodeId : targetNodeId;
    const fromPortId = connectingSource.isOutput ? connectingSource.portId : targetPortId;
    const toNodeId = connectingSource.isOutput ? targetNodeId : connectingSource.nodeId;
    const toPortId = connectingSource.isOutput ? targetPortId : connectingSource.portId;

    const fromNode = nodes.find(n => n.id === fromNodeId);
    const toNode = nodes.find(n => n.id === toNodeId);
    if (!fromNode || !toNode) {
      setConnectingSource(null);
      return;
    }

    const outPort = fromNode.outputs.find(p => p.id === fromPortId);
    const inPort = toNode.inputs.find(p => p.id === toPortId);
    if (!outPort || !inPort) {
      setConnectingSource(null);
      return;
    }

    // 檢查類型相容性 (solid 連 solid, fluid 連 fluid)
    if (outPort.type !== inPort.type) {
      alert(`⚠️ 端口類型不相容：無法將 ${outPort.type === 'fluid' ? '流體' : '固體'} 連接至 ${inPort.type === 'fluid' ? '流體' : '固體'} 端口！`);
      setConnectingSource(null);
      return;
    }

    // 注入機輸出防呆：注入機為原位轉化設備，輸出液體必須先接至泵機，再由泵機供入目標設備
    if (fromNode.machineName === '注入機' && toNode.type !== 'pump') {
      alert('⚠️ 注入機屬於「原位轉化」環境設備，原位轉化液無法直接拉管接至加工機台！\n請先將注入機輸出端接至「抽取泵機」，再由泵機抽取輸送至目標設備。');
      setConnectingSource(null);
      return;
    }

    // 若目標端為分流器：檢查物料混流衝突與下游相容性
    if (toNode.type === 'splitter') {
      const existingIncoming = connections.filter(c => c.toNodeId === toNode.id);
      if (existingIncoming.length > 0) {
        const existingItem = normalizeItemName(existingIncoming[0].itemOrFluidName);
        const newItem = normalizeItemName(outPort.name);
        if (existingItem && newItem && existingItem !== '待分流物料' && newItem !== '待分流物料' && existingItem !== newItem) {
          alert(`⚠️ 分流器物料衝突！\n該分流器已接收「${existingItem}」，嚴禁混入「${newItem}」造成混流污染！\n如需分流請使用獨立分流器。`);
          setConnectingSource(null);
          return;
        }
      }

      // 檢查分流器已有的下游連線是否與即將連入的物料衝突
      const outgoingConns = connections.filter(c => c.fromNodeId === toNode.id);
      for (const outConn of outgoingConns) {
        const downstreamNode = nodes.find(n => n.id === outConn.toNodeId);
        const downstreamInPort = downstreamNode?.inputs.find(p => p.id === outConn.toPortId);
        if (downstreamNode && downstreamInPort) {
          if (!isItemMatch(outPort.name, downstreamInPort.name, downstreamNode, downstreamInPort.id)) {
            alert(`⚠️ 分流器下游衝突！\n該分流器下游已連接至「${downstreamNode.title}」的「${downstreamInPort.name}」端口。\n無法連入不相符的「${outPort.name}」！`);
            setConnectingSource(null);
            return;
          }
        }
      }
    }

    // 若目標端為通用泵機：檢查泵機下游連線是否與即將連入的液源相容
    if (toNode.type === 'pump' && inPort.id === 'in-fluid') {
      const outgoingConns = connections.filter(c => c.fromNodeId === toNode.id);
      for (const outConn of outgoingConns) {
        const downstreamNode = nodes.find(n => n.id === outConn.toNodeId);
        const downstreamInPort = downstreamNode?.inputs.find(p => p.id === outConn.toPortId);
        if (downstreamNode && downstreamInPort) {
          if (!isItemMatch(outPort.name, downstreamInPort.name, downstreamNode, downstreamInPort.id)) {
            alert(`⚠️ 泵機下游衝突！\n該泵機下游已連接至「${downstreamNode.title}」的「${downstreamInPort.name}」端口。\n無法連入不相符的「${outPort.name}」！`);
            setConnectingSource(null);
            return;
          }
        }
      }
    }

    // 檢查物料名稱相容性 (嚴格認物品)
    const isUnconfiguredSplitterOut = fromNode.type === 'splitter' && (
      normalizeItemName(outPort.name) === '分流物品' ||
      outPort.name.startsWith('分流') ||
      connections.filter(c => c.toNodeId === fromNode.id).length === 0
    );
    const isUnconfiguredPumpOut = fromNode.type === 'pump' && (
      outPort.name === '通用流體' ||
      connections.filter(c => c.toNodeId === fromNode.id && c.toPortId === 'in-fluid').length === 0
    );

    if (!isUnconfiguredSplitterOut && !isUnconfiguredPumpOut && !isItemMatch(outPort.name, inPort.name, toNode, inPort.id)) {
      alert(`⚠️ 物料不符合！\n目標端口需求：「${inPort.name}」\n來源輸出提供：「${outPort.name}」\n兩者不相符，無法連接！`);
      setConnectingSource(null);
      return;
    }

    // 檢查是否已存在相同連線
    const exists = connections.some(
      c => c.fromNodeId === fromNode.id && c.fromPortId === outPort.id && c.toNodeId === toNode.id && c.toPortId === inPort.id
    );
    if (exists) {
      setConnectingSource(null);
      return;
    }

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
    // 分流器內部含有配置面板，卡片高度相應增加以精準貼齊底部端口
    const bodyHeight = node.type === 'splitter'
      ? (node.splitterMode === 'custom' ? 240 : 170)
      : 110;
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
            <div className="grid grid-cols-4 border-b border-[#1c2e38] text-[10px] font-bold p-1 bg-slate-950/40 gap-0.5">
              <button 
                onClick={() => setActiveCatalogTab('machines')}
                className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'machines' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                中間工序
              </button>
              <button 
                onClick={() => setActiveCatalogTab('items')}
                className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'items' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                自然採集
              </button>
              <button 
                onClick={() => setActiveCatalogTab('fluids')}
                className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'fluids' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                流體/能源
              </button>
              <button 
                onClick={() => setActiveCatalogTab('recipes')}
                className={`py-1.5 rounded-lg transition-colors text-center ${activeCatalogTab === 'recipes' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-slate-200'}`}
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

              {/* 分頁 2: 基礎物資、採掘礦產與活體重構 */}
              {activeCatalogTab === 'items' && (() => {
                // 嚴格過濾原生開採物資：一律依 items.json 之 source 欄位判定（純資料庫驅動，新增食材免改程式）
                const isReconItem = (i: Item) => i.source === '物質操縱機';
                const isMinerItem = (i: Item) => i.source === '採掘機' || i.source === '採掘機直接開採';
                const isHarvestItem = (i: Item) => !isReconItem(i) && !isMinerItem(i) && i.source === '收割機';

                const filteredRawItems = items.filter(i => {
                  if (i.isFluid) return false;
                  // 防禦性過濾：自動排除地圖地塊與殘留虛擬項目
                  if (i.name.includes('植株') || i.name.includes('(礦石方塊)') || i.name.includes('(香料方塊)')) return false;

                  // 必須屬於三種合法基礎來源之一
                  const matchType = isReconItem(i) || isMinerItem(i) || isHarvestItem(i);
                  if (!matchType) return false;

                  // 搜尋關鍵字
                  const matchQuery = i.name.includes(searchQuery) || (i.source && i.source.includes(searchQuery)) || (i.island && i.island.includes(searchQuery));
                  if (!matchQuery) return false;

                  // 分類切換過濾
                  if (itemsFilter === 'miner') return isMinerItem(i);
                  if (itemsFilter === 'harvester') return isHarvestItem(i);
                  if (itemsFilter === 'reconstructor') return isReconItem(i);
                  return true;
                });

                return (
                  <div className="space-y-2">
                    {/* 子分類快速過濾膠囊 */}
                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/70 rounded-xl text-[10px] font-bold border border-slate-800">
                      <button
                        onClick={() => setItemsFilter('all')}
                        className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'all' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        全部
                      </button>
                      <button
                        onClick={() => setItemsFilter('miner')}
                        className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'miner' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        ⛏️ 採掘
                      </button>
                      <button
                        onClick={() => setItemsFilter('harvester')}
                        className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'harvester' ? 'bg-green-500/20 text-green-300' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        🌾 收割
                      </button>
                      <button
                        onClick={() => setItemsFilter('reconstructor')}
                        className={`py-1 rounded-lg transition-colors text-center ${itemsFilter === 'reconstructor' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        🧬 重構
                      </button>
                    </div>

                    <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider flex items-center justify-between">
                      <span>基礎原料庫 ({filteredRawItems.length})</span>
                      <Pickaxe className="w-3 h-3 text-slate-500" />
                    </div>

                    {filteredRawItems.map(item => {
                      const isRecon = isReconItem(item);
                      const isMine = isMinerItem(item);

                      let badgeText = '收割機';
                      let badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                      let descText = '0.20/s · 自主採收';

                      if (isRecon) {
                        badgeText = '物質操縱機';
                        badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                        descText = item.name === '虛空汙泥'
                          ? '0.20/s · 空載凝結 (僅需虛空 1.0 fl/s)'
                          : (item.name === '泥沼蟑螂' ? '0.40/s · 吃底料+虛空' : '0.20/s · 吃底料+虛空');
                      } else if (isMine) {
                        badgeText = '採掘機';
                        badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                        descText = '0.20/s · 自主開採';
                      }

                      return (
                        <div
                          key={item.name}
                          onClick={() => handleAddItemHarvester(item)}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-emerald-500/50 cursor-pointer transition-all group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <ItemIcon name={item.name} size="sm" />
                            <div className="truncate">
                              <div className="flex items-center space-x-1.5 truncate">
                                <span className="font-bold text-slate-200 truncate group-hover:text-emerald-300 transition-colors">
                                  {item.name}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border shrink-0 ${badgeClass}`}>
                                  {badgeText}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                                <span>{descText}</span>
                                {item.island && (
                                  <>
                                    <span>·</span>
                                    <span>{item.island}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* 分頁 3: 流體環境池、外採泵機與電網 */}
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

                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">💧 抽取泵機站 (投入虛空汙泥自動超頻)</div>
                  {['水', '油', '虛空'].map(fluid => (
                    <div 
                      key={fluid}
                      onClick={() => handleAddInfrastructure('pump', fluid)}
                      className="p-2 rounded-xl bg-[#0e161c] hover:bg-[#132029] border border-cyan-900/40 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2">
                        <Droplets className="w-4 h-4 text-cyan-400" />
                        <div>
                          <div className="font-bold text-slate-200 group-hover:text-cyan-300">{fluid}抽取泵機</div>
                          <div className="text-[10px] text-slate-400">常規 2.0 fl/s · 供汙泥超頻 8.0 fl/s</div>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                    </div>
                  ))}

                  <div 
                    onClick={() => handleAddInfrastructure('pump', 'generic')}
                    className="p-2 rounded-xl bg-[#140e1c] hover:bg-[#1f142b] border border-purple-900/40 hover:border-purple-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <Droplets className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-purple-300">通用抽取泵機 (無指定液體)</div>
                        <div className="text-[10px] text-slate-400">接注入機或環境池 · 常規 2.0 / 超頻 8.0 fl/s</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-purple-400" />
                  </div>

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
                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider mt-3">🔀 物流分流與時序發酵</div>
                  <div 
                    onClick={() => handleAddInfrastructure('splitter')}
                    className="p-2 rounded-xl bg-[#0e1724] hover:bg-[#152336] border border-blue-900/40 hover:border-blue-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <GitFork className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-blue-300">物品分流器 (1進2出)</div>
                        <div className="text-[10px] text-slate-400">固體傳送帶 1:1 均分 · 即時分流</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
                  </div>

                  <div 
                    onClick={() => handleAddInfrastructure('buffer_decay')}
                    className="p-2 rounded-xl bg-[#0c1a14] hover:bg-[#12261d] border border-emerald-900/40 hover:border-emerald-500/50 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2">
                      <Hourglass className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-emerald-300">發酵變質緩衝方塊 (自選)</div>
                        <div className="text-[10px] text-slate-400">時序輸送帶發酵 · 依原料自動轉化</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
                  </div>

                  {/* 常用遊戲時序發酵快捷項 */}
                  {[
                    { name: '麵包麵團', prod: '發酵麵糰', time: 15 },
                    { name: '軟質奶酪', prod: '中等熟成奶酪', time: 20 },
                    { name: '中等熟成奶酪', prod: '硬質奶酪', time: 30 },
                    { name: '硬質奶酪', prod: '藍紋奶酪', time: 60 },
                    { name: '蛇蛋', prod: '臭蛇蛋', time: 30 },
                    { name: '蟑螂奶油', prod: '酸奶油', time: 30 }
                  ].map(ferment => (
                    <div 
                      key={ferment.name}
                      onClick={() => handleAddInfrastructure('buffer_decay', ferment.name)}
                      className="p-2 rounded-xl bg-[#091512] hover:bg-[#0e211d] border border-emerald-950/60 hover:border-emerald-500/40 cursor-pointer flex items-center justify-between group pl-4"
                    >
                      <div className="flex items-center space-x-2">
                        <ItemIcon name={ferment.prod} size="sm" />
                        <div>
                          <div className="font-bold text-slate-200 group-hover:text-emerald-300 text-[11px]">
                            {ferment.name} ➔ {ferment.prod}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            發酵 {ferment.time}s · 傳送帶 ≥ {ferment.time} 格
                          </div>
                        </div>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                    </div>
                  ))}
                </div>
              )}

              {/* 分頁 3: 終端料理自動廚師機 */}
              {activeCatalogTab === 'recipes' && (
                <div className="space-y-3">
                  {/* 全域料理出餐目標設定 */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-900/50 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300 flex items-center space-x-1">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span>預設料理出餐目標</span>
                      </span>
                      <span className="font-mono text-slate-300 font-bold">
                        {defaultDishRateMin} 份/分
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {[12, 24, 36].map(rate => (
                        <button
                          key={rate}
                          onClick={() => setDefaultDishRateMin(rate)}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-colors ${
                            defaultDishRateMin === rate
                              ? 'bg-amber-500/30 text-amber-300 font-bold border border-amber-500/50'
                              : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                          title={`設定預設出餐目標為 ${rate} 份/分 (${(rate / 12).toFixed(1)} 台廚師機需求)`}
                        >
                          {rate} 份/分
                        </button>
                      ))}
                      <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 w-20">
                        <input
                          type="number"
                          min="1"
                          value={defaultDishRateMin}
                          onChange={(e) => setDefaultDishRateMin(Math.max(1, Number(e.target.value) || 12))}
                          className="w-full bg-transparent text-[10px] font-mono text-amber-200 outline-none text-center"
                          title="自訂出餐目標"
                        />
                        <span className="text-[9px] text-slate-500 ml-0.5">/分</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-500">
                      💡 放置料理時直接以此產能為基準；若為熾熱料理將自動連動【胃復慘】。
                    </div>
                  </div>

                  <div className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider flex items-center justify-between">
                    <span>終端組裝料理 ({recipes.filter(r => r.name.includes(searchQuery)).length})</span>
                    <Sparkles className="w-3 h-3 text-amber-400" />
                  </div>
                  {recipes
                    .filter(r => r.name.includes(searchQuery))
                    .map(r => {
                      const mach = machines.find(m => m.name === '自動廚師機') || { name: '自動廚師機', power: 1.0, goblins: 3 };
                      const isScorching = isScorchingDish(r.name, items, recipes);
                      return (
                        <div
                          key={r.name}
                          onClick={() => handleAddMachineWithRecipe(mach as Machine, r)}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#0e171c] hover:bg-[#14222a] border border-slate-800/80 hover:border-amber-500/50 cursor-pointer transition-all group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <ItemIcon name="自動廚師機" size="sm" />
                            <div className="truncate">
                              <div className="flex items-center space-x-1.5 truncate">
                                <span className="font-bold text-slate-200 truncate group-hover:text-amber-300 transition-colors">
                                  {r.name}
                                </span>
                                {isScorching && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold shrink-0" title="熾熱菜餚：點擊將自動配對【胃復慘】">
                                    🌶️ 熾熱
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                                <span>出餐 {defaultDishRateMin} 份/分</span>
                                {r.island && (
                                  <>
                                    <span>·</span>
                                    <span>{r.island}</span>
                                  </>
                                )}
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
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 畫布左上角浮動專案控制列 (產線專案/藍圖管理) */}
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
            onClick={handleQuickSave}
            className="px-2.5 py-1.5 hover:bg-slate-800 hover:text-amber-300 rounded-xl transition-colors flex items-center space-x-1 text-slate-300"
            title="儲存變更 (Ctrl+S / 點擊快速覆寫)"
          >
            <Save className="w-3.5 h-3.5" />
            <span>儲存</span>
          </button>

          <button
            onClick={() => setIsBlueprintModalOpen(true)}
            className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl transition-colors flex items-center space-x-1 font-bold shadow-sm"
            title="開啟產線專案庫 (無限儲存、複製副本、重新命名、匯入匯出)"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>專案庫 / 藍圖</span>
          </button>

          <button
            onClick={() => setIsBlueprintModalOpen(true)}
            className="px-2.5 py-1.5 hover:bg-purple-950/40 text-purple-300 hover:text-purple-200 rounded-xl transition-colors flex items-center space-x-1 border border-purple-800/40"
            title="一鍵同步至 GitHub 跨裝置帶著走"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>同步 GIT</span>
          </button>

          {quickSaveFeedback && (
            <div className="px-2 py-1 bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[11px] rounded-lg animate-fadeIn font-bold">
              {quickSaveFeedback}
            </div>
          )}
        </div>

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

            {/* 正在拉線中的臨時虛線 (支援雙向貝茲曲線與動態指示) */}
            {connectingSource && (
              <g>
                <path
                  d={connectingSource.isOutput
                    ? `M ${connectingSource.startX} ${connectingSource.startY} C ${connectingSource.startX + 60} ${connectingSource.startY}, ${connectingSource.currentX - 60} ${connectingSource.currentY}, ${connectingSource.currentX} ${connectingSource.currentY}`
                    : `M ${connectingSource.startX} ${connectingSource.startY} C ${connectingSource.startX - 60} ${connectingSource.startY}, ${connectingSource.currentX + 60} ${connectingSource.currentY}, ${connectingSource.currentX} ${connectingSource.currentY}`
                  }
                  fill="none"
                  stroke={connectingSource.portType === 'fluid' ? '#06b6d4' : '#f59e0b'}
                  strokeWidth={2.5}
                  strokeDasharray="5,4"
                  className="animate-pulse"
                />
                <circle
                  cx={connectingSource.currentX}
                  cy={connectingSource.currentY}
                  r={5}
                  fill={connectingSource.portType === 'fluid' ? '#06b6d4' : '#f59e0b'}
                  className="animate-ping opacity-75"
                />
                <circle
                  cx={connectingSource.currentX}
                  cy={connectingSource.currentY}
                  r={4}
                  fill={connectingSource.portType === 'fluid' ? '#22d3ee' : '#fbbf24'}
                />
              </g>
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
                onUpdateNode={handleUpdateNode}
                onUpdateDishTargetRate={handleUpdateDishTargetRate}
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

      {/* 產線專案庫管理彈窗 */}
      <SandboxBlueprintModal
        isOpen={isBlueprintModalOpen}
        onClose={() => setIsBlueprintModalOpen(false)}
        currentNodes={nodes}
        currentConnections={connections}
        currentPan={pan}
        currentZoom={zoom}
        currentBlueprintId={currentBlueprintId}
        onLoadBlueprint={handleLoadBlueprint}
        onSaveCurrentSuccess={handleSaveCurrentSuccess}
      />

    </div>
  );
};
