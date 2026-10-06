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
import {
  makeNode,
  calibrateNodeBaseRates,
  configureDishNodeRates,
  cloneSubgraph,
  sameNodesIgnoringPosition,
  saveCanvasToLocal
} from './sandboxNodeUtils';
import { sandboxBlueprintService } from '../../services/sandboxBlueprintService';
import { Machine, Item, IntermediateRecipe, Recipe } from '../../types';
import { isScorchingDish } from '../../services/solver';
import { SandboxCatalogSidebar, InfrastructureType } from './SandboxCatalogSidebar';
import { SandboxMetricsPanel } from './SandboxMetricsPanel';
import { SandboxToolbar } from './SandboxToolbar';
import { SandboxConnectionsLayer, ConnectingSource } from './SandboxConnectionsLayer';
import { Compass } from 'lucide-react';
import { buildFluidNameSet, isFluidName, rawSourceMachine } from '../../utils/itemTraits';

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
  // 連續管網流體集合：由食譜 fluidType 引用推導（資料驅動）
  const fluidNames = useMemo(() => buildFluidNameSet(recipes, intermediate), [recipes, intermediate]);

  // 核心沙盒狀態
  const [nodes, setNodes] = useState<SandboxNodeData[]>(() => {
    const saved = localStorage.getItem('snacktorio_sandbox_nodes_v1');
    if (saved) {
      try {
        const parsed: SandboxNodeData[] = JSON.parse(saved);
        // 自動校準既有節點的端口型別與物理基準產能 (防止舊版快取殘留膨脹產能或將固體標記為 fluid)
        return parsed.map(n => ({
          ...calibrateNodeBaseRates(n, recipes, intermediate),
          outputs: n.outputs.map(p => ({
            ...p,
            type: isFluidName(p.name, fluidNames, items) || n.machineName === '注入機' ? 'fluid' : 'solid'
          }))
        }));
      } catch (e) { /* ignore */ }

    }
    // 預設樣板：1 台發電熔爐 + 1 台採煤機 + 1 台水泵 + 1 台煮鍋 (示範新手開局)
    return [
      makeNode({
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
        inputs: [{ id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 }],
        outputs: []
      }),
      makeNode({
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
        inputs: [],
        outputs: [{ id: 'out-coal', name: '煤炭', type: 'solid', rateProvided: 0.2 }]
      })
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [isMarqueeMode, setIsMarqueeMode] = useState<boolean>(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const dragNodesStartPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // 終端料理預設出餐產能 (側欄型錄與新增廚師機共用；側欄其餘 UI 狀態由 SandboxCatalogSidebar 自行管理)
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
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 顯示操作提示：新訊息會取消舊計時器，避免舊計時器提早清除新訊息
  const flashFeedback = useCallback((msg: string, ms: number = 3000) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setQuickSaveFeedback(msg);
    feedbackTimerRef.current = setTimeout(() => setQuickSaveFeedback(null), ms);
  }, []);

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
  const [connectingSource, setConnectingSource] = useState<ConnectingSource | null>(null);

  // 邊緣自動推鏡頭 (Auto-Pan) 與即時座標同步 Ref
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const connectingSourceRef = useRef(connectingSource);
  connectingSourceRef.current = connectingSource;

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
  // 物理結果與節點座標無關：拖曳時僅座標改變，沿用上次物理結果並套用最新座標，避免每幀重算
  // ==========================================
  const physicsNodesRef = useRef(nodes);
  if (!sameNodesIgnoringPosition(physicsNodesRef.current, nodes)) {
    physicsNodesRef.current = nodes;
  }
  const physicsNodes = physicsNodesRef.current;
  const physics = useMemo(() => {
    return simulateSandboxPhysics(physicsNodes, connections);
  }, [physicsNodes, connections]);
  const { updatedConnections, metrics } = physics;
  const updatedNodes = useMemo(() => {
    if (physicsNodes === nodes) return physics.updatedNodes;
    const posMap = new Map(nodes.map(n => [n.id, n]));
    return physics.updatedNodes.map(n => {
      const cur = posMap.get(n.id);
      return cur && (cur.x !== n.x || cur.y !== n.y) ? { ...n, x: cur.x, y: cur.y } : n;
    });
  }, [physics, physicsNodes, nodes]);

  // 本機自動存檔 (300ms 防抖；離開頁面或切換分頁時立即寫入最新狀態)
  const latestCanvasRef = useRef({ nodes, connections });
  latestCanvasRef.current = { nodes, connections };
  useEffect(() => {
    const timer = setTimeout(() => saveCanvasToLocal(nodes, connections), 300);
    return () => clearTimeout(timer);
  }, [nodes, connections]);
  useEffect(() => {
    const flush = () => saveCanvasToLocal(latestCanvasRef.current.nodes, latestCanvasRef.current.connections);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

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
      flashFeedback(`已儲存「${updated.name}」！`);
    } else {
      setIsBlueprintModalOpen(true);
    }
  }, [currentBlueprintId, currentBlueprintName, nodes, connections, pan, zoom]);

  // 剪貼簿狀態 (支援選中機台或整廠產線複製貼上)
  const [clipboardData, setClipboardData] = useState<{
    nodes: SandboxNodeData[];
    connections: SandboxConnection[];
  } | null>(null);

  // 複製選中（局部多選）或全廠產線
  const handleCopy = useCallback(() => {
    let nodesToCopy: SandboxNodeData[] = [];
    const activeSelectedIds = selectedNodeIds.length > 0 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : []);
    if (activeSelectedIds.length > 0) {
      nodesToCopy = nodes.filter(n => activeSelectedIds.includes(n.id));
    }
    // 若未選取特定節點，則預設複製當前整廠產線
    if (nodesToCopy.length === 0) {
      nodesToCopy = [...nodes];
    }
    if (nodesToCopy.length === 0) return;

    const nodeIds = new Set(nodesToCopy.map(n => n.id));
    const connsToCopy = connections.filter(c => nodeIds.has(c.fromNodeId) && nodeIds.has(c.toNodeId));

    setClipboardData({ nodes: nodesToCopy, connections: connsToCopy });
    flashFeedback(`已複製 ${nodesToCopy.length} 台機台與 ${connsToCopy.length} 條內部管線至剪貼簿！(按 Ctrl+V 貼上)`);
  }, [selectedNodeIds, selectedNodeId, nodes, connections]);

  // 貼上產線 (在當前視野中央附近產生副本)
  const handlePaste = useCallback(() => {
    if (!clipboardData || clipboardData.nodes.length === 0) {
      flashFeedback('剪貼簿為空！請先框選/點選機台按 Ctrl+C 複製', 2500);
      return;
    }

    const { nodes: clipNodes, connections: clipConns } = clipboardData;
    const minX = Math.min(...clipNodes.map(n => n.x));
    const minY = Math.min(...clipNodes.map(n => n.y));

    // 計算貼上座標：置於目前視野中央附近，微幅錯開 40px
    const offsetX = (-pan.x + 350) - minX + (Math.random() * 40);
    const offsetY = (-pan.y + 180) - minY + (Math.random() * 40);

    const { nodes: newNodes, connections: newConns } =
      cloneSubgraph(clipNodes, clipConns, offsetX, offsetY, 6, recipes, intermediate);

    setNodes(prev => [...prev, ...newNodes]);
    setConnections(prev => [...prev, ...newConns]);
    const pastedIds = newNodes.map(n => n.id);
    setSelectedNodeIds(pastedIds);
    setSelectedNodeId(pastedIds[0] || null);

    flashFeedback(`已貼上 ${newNodes.length} 台設備與 ${newConns.length} 條管線！`);
  }, [clipboardData, pan]);

  // 鍵盤 Ctrl+S / Ctrl+C / Ctrl+V 快捷鍵監聽
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleQuickSave();
        } else if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          handleCopy();
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          handlePaste();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleQuickSave, handleCopy, handlePaste]);

  // 載入專案 (清空並覆寫當前畫布，同時校準歷史殘留產能倍率)
  const handleLoadBlueprint = useCallback((bp: SandboxBlueprint) => {
    const calibratedNodes = bp.nodes.map(n => calibrateNodeBaseRates(n, recipes, intermediate));

    setNodes(calibratedNodes);
    setConnections(bp.connections);
    if (bp.pan) setPan(bp.pan);
    if (bp.zoom) setZoom(bp.zoom);
    setCurrentBlueprintId(bp.id);
    setCurrentBlueprintName(bp.name);
    flashFeedback(`已載入「${bp.name}」！`);
  }, [recipes, intermediate]);

  // 追加專案至當前畫布 (不覆寫現有機台，自動計算右側邊界平移)
  const handleAppendBlueprint = useCallback((bp: SandboxBlueprint) => {
    if (bp.nodes.length === 0) return;

    // 計算現有畫布右側邊界
    const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x)) + 380 : (-pan.x + 100);
    const minY = nodes.length > 0 ? Math.min(...nodes.map(n => n.y)) : (-pan.y + 100);
    const bpMinX = Math.min(...bp.nodes.map(n => n.x));
    const bpMinY = Math.min(...bp.nodes.map(n => n.y));
    const offsetX = maxX - bpMinX;
    const offsetY = minY - bpMinY;

    const { nodes: clonedNodes, connections: clonedConns } =
      cloneSubgraph(bp.nodes, bp.connections, offsetX, offsetY, 7, recipes, intermediate);

    setNodes(prev => [...prev, ...clonedNodes]);
    setConnections(prev => [...prev, ...clonedConns]);
    flashFeedback(`已將「${bp.name}」追加至畫布 (${clonedNodes.length} 台設備)！`, 3500);
    setIsBlueprintModalOpen(false);
  }, [nodes, pan, recipes, intermediate]);


  // 另存/儲存成功回調
  const handleSaveCurrentSuccess = useCallback((bp: SandboxBlueprint) => {
    setCurrentBlueprintId(bp.id);
    setCurrentBlueprintName(bp.name);
    flashFeedback(`已成功儲存「${bp.name}」！`);
  }, []);

  // ==========================================
  // 終端料理產能換算與炙熱菜餚連動引擎
  // ==========================================

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
  }, [items, recipes, machines]);

  // ==========================================
  // 節點生成工廠 (純資料庫驅動，自適應未來任何新配方)
  // ==========================================
  const handleAddMachineWithRecipe = (mach: Machine, recipeOrInter?: IntermediateRecipe | Recipe) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
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
      const isOutFluid = isFluidName(recipeOrInter.name, fluidNames, items) || mach.name === '注入機';
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

    const rawNode: SandboxNodeData = makeNode({
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
      inputs,
      outputs
    });

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
          const peptoRawNode: SandboxNodeData = makeNode({
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
            isAutoPepto: true,
            inputs: [],
            outputs: []
          });
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
    const id = `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    // 依據資料庫 source 與物理特性，精準匹配實體設備
    let machName = '收割機';
    let titlePrefix = '採收';
    let baseInputs: SandboxNodeData['inputs'] = [];
    let outCount = 1;
    let cycleTime = 5;

    const rawMach = rawSourceMachine(item);
    const isReconstructor = rawMach === '物質操縱機';
    const isMiner = rawMach === '採掘機';

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

    const newNode: SandboxNodeData = makeNode({
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
      inputs: baseInputs,
      outputs: [
        {
          id: `out-${item.name}`,
          name: item.name,
          type: 'solid',
          rateProvided: outRate
        }
      ]
    });

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const handleAddInfrastructure = (type: InfrastructureType, subtype?: string) => {
    const id = `infra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let node: SandboxNodeData;

    if (type === 'generator') {
      node = makeNode({
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
        inputs: subtype === 'overclock' 
          ? [
              { id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 },
              { id: 'in-sludge', name: '虛空汙泥', type: 'solid', rateRequired: 0.1 }
            ]
          : [{ id: 'in-coal', name: '煤炭', type: 'solid', rateRequired: 0.1 }],
        outputs: []
      });
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

      node = makeNode({
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
        efficiency: isGeneric ? 0 : 1.0,
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
      });
    } else if (type === 'splitter') {
      node = makeNode({
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
        efficiency: 0,
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
      });
    } else if (type === 'buffer_decay') {
      // 發酵變質 / 輸送緩衝方塊 (支援指定變質物或泛用緩衝)
      const perishItem = subtype ? items.find(i => i.name === subtype) : null;
      const rawName = perishItem?.name || '發酵原料';
      const prodName = perishItem?.spoilProduct || '熟成產物';
      const spoilSeconds = Number(perishItem?.spoilTime) || 15;

      node = makeNode({
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
        efficiency: 0,
        statusNote: `⏳ 發酵需時 ${spoilSeconds}s (傳送帶長度 ≥ ${spoilSeconds} 格)`,
        inputs: [
          { id: 'in-raw', name: rawName, type: 'solid', rateRequired: 0.2 }
        ],
        outputs: [
          { id: 'out-spoiled', name: prodName, type: 'solid', rateProvided: 0 }
        ]
      });
    } else {
      // 環境池 (水池, 油池, 虛空裂隙)
      const fluid = subtype || '油池';
      node = makeNode({
        id,
        type: 'environment_pool',
        title: `環境資源：${fluid}`,
        x: -pan.x + 300,
        y: -pan.y + 150,
        baseCycleTime: 1,
        baseOutputCount: 999,
        basePowerConsumption: 0,
        baseGoblins: 0,
        inputs: [],
        outputs: [{ id: `out-env-${fluid}`, name: fluid.replace('池', ''), type: 'fluid', rateProvided: 999 }]
      });
    }

    setNodes(prev => [...prev, node]);
    setSelectedNodeId(id);
  };

  // ==========================================
  // 滑鼠互動：拖曳、平移與縮放
  // ==========================================
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // 支援 Shift+左鍵 或 框選模式：啟動矩形框選
    if (e.button === 0 && (e.shiftKey || isMarqueeMode)) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const worldX = (e.clientX - rect.left - pan.x) / zoom;
        const worldY = (e.clientY - rect.top - pan.y) / zoom;
        setSelectionBox({
          startX: worldX,
          startY: worldY,
          currentX: worldX,
          currentY: worldY
        });
        setSelectedNodeIds([]);
        setSelectedNodeId(null);
      }
      return;
    }

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
        setSelectedNodeIds([]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };

    // 矩形框選拖曳中
    if (selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const worldX = (e.clientX - rect.left - pan.x) / zoom;
        const worldY = (e.clientY - rect.top - pan.y) / zoom;
        setSelectionBox(prev => prev ? { ...prev, currentX: worldX, currentY: worldY } : null);

        const minX = Math.min(selectionBox.startX, worldX);
        const maxX = Math.max(selectionBox.startX, worldX);
        const minY = Math.min(selectionBox.startY, worldY);
        const maxY = Math.max(selectionBox.startY, worldY);

        const insideIds = nodes.filter(n => {
          const w = 260;
          const h = 180;
          return n.x + w >= minX && n.x <= maxX && n.y + h >= minY && n.y <= maxY;
        }).map(n => n.id);

        setSelectedNodeIds(insideIds);
        setSelectedNodeId(insideIds[insideIds.length - 1] || null);
      }
      return;
    }

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
      const posMap = dragNodesStartPositionsRef.current;

      setNodes(prev => prev.map(n => {
        if (posMap && posMap[n.id]) {
          return {
            ...n,
            x: posMap[n.id].x + dx,
            y: posMap[n.id].y + dy
          };
        } else if (n.id === draggingNodeId) {
          return {
            ...n,
            x: (dragStartRef.current.initialX || n.x) + dx,
            y: (dragStartRef.current.initialY || n.y) + dy
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
    if (selectionBox) {
      if (selectedNodeIds.length > 0) {
        flashFeedback(`已框選 ${selectedNodeIds.length} 台機台！(可按 Ctrl+C 複製)`);
      }
      setSelectionBox(null);
    }
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
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey) {
      setSelectedNodeIds(prev => {
        const next = prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId];
        setSelectedNodeId(next[next.length - 1] || null);
        return next;
      });
      return;
    }

    const currentMulti = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
    setSelectedNodeIds(currentMulti);
    setSelectedNodeId(nodeId);
    setDraggingNodeId(nodeId);

    // 記錄群組拖曳起始位置
    const posMap: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      if (currentMulti.includes(n.id)) {
        posMap[n.id] = { x: n.x, y: n.y };
      }
    });
    dragNodesStartPositionsRef.current = posMap;

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
    const idsToDelete = (selectedNodeIds.includes(id) && selectedNodeIds.length > 1) 
      ? selectedNodeIds 
      : [id];

    setNodes(prev => {
      const remaining = prev.filter(n => !idsToDelete.includes(n.id));
      return syncAutoPeptoNodes(remaining);
    });
    setConnections(prev => prev.filter(c => !idsToDelete.includes(c.fromNodeId) && !idsToDelete.includes(c.toNodeId)));
    setSelectedNodeIds(prev => prev.filter(i => !idsToDelete.includes(i)));
    if (selectedNodeId && idsToDelete.includes(selectedNodeId)) setSelectedNodeId(null);
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
  }, [recipes, machines, syncAutoPeptoNodes]);

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

  // 檢查分流器/泵機既有下游連線是否與即將連入的物料不符；不符則提示並取消拉線
  const hasDownstreamConflict = (hubNodeId: string, incomingName: string, hubLabel: string): boolean => {
    const outgoingConns = connections.filter(c => c.fromNodeId === hubNodeId);
    for (const outConn of outgoingConns) {
      const downstreamNode = nodes.find(n => n.id === outConn.toNodeId);
      const downstreamInPort = downstreamNode?.inputs.find(p => p.id === outConn.toPortId);
      if (downstreamNode && downstreamInPort) {
        if (!isItemMatch(incomingName, downstreamInPort.name, downstreamNode, downstreamInPort.id)) {
          alert(`⚠️ ${hubLabel}下游衝突！\n該${hubLabel}下游已連接至「${downstreamNode.title}」的「${downstreamInPort.name}」端口。\n無法連入不相符的「${incomingName}」！`);
          setConnectingSource(null);
          return true;
        }
      }
    }
    return false;
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
      if (hasDownstreamConflict(toNode.id, outPort.name, '分流器')) return;
    }

    // 若目標端為通用泵機：檢查泵機下游連線是否與即將連入的液源相容
    if (toNode.type === 'pump' && inPort.id === 'in-fluid') {
      if (hasDownstreamConflict(toNode.id, outPort.name, '泵機')) return;
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
      id: `conn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

  // 取得節點端口的畫布絕對座標 (以 id 索引查表；重複 id 時與 Array.find 相同取第一筆)
  const nodeById = useMemo(() => {
    const map = new Map<string, SandboxNodeData>();
    nodes.forEach(n => { if (!map.has(n.id)) map.set(n.id, n); });
    return map;
  }, [nodes]);
  const getPortCoordinates = (nodeId: string, portId: string, isOutput: boolean) => {
    const node = nodeById.get(nodeId);
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
      <SandboxCatalogSidebar
        machines={machines}
        items={items}
        intermediate={intermediate}
        recipes={recipes}
        defaultDishRateMin={defaultDishRateMin}
        setDefaultDishRateMin={setDefaultDishRateMin}
        handleAddMachineWithRecipe={handleAddMachineWithRecipe}
        handleAddItemHarvester={handleAddItemHarvester}
        handleAddInfrastructure={handleAddInfrastructure}
      />

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
        <SandboxToolbar
          currentBlueprintName={currentBlueprintName}
          currentBlueprintId={currentBlueprintId}
          isMarqueeMode={isMarqueeMode}
          quickSaveFeedback={quickSaveFeedback}
          onQuickSave={handleQuickSave}
          onOpenBlueprints={() => setIsBlueprintModalOpen(true)}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onToggleMarquee={() => setIsMarqueeMode(!isMarqueeMode)}
        />

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
          {/* 矩形框選拖曳視覺指示框 */}
          {selectionBox && (
            <div 
              className="absolute border-2 border-dashed border-cyan-400 bg-cyan-500/15 rounded-xl pointer-events-none z-30 transition-none shadow-lg shadow-cyan-500/10"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY)
              }}
            />
          )}

          {/* SVG 連線層 */}
          <SandboxConnectionsLayer
            connections={updatedConnections}
            connectingSource={connectingSource}
            getPortCoordinates={getPortCoordinates}
            onDeleteConnection={handleDeleteConnection}
          />

          {/* 節點卡片層 */}
          <div className="pointer-events-auto">
            {updatedNodes.map(node => (
              <SandboxNode
                key={node.id}
                node={node}
                isSelected={selectedNodeIds.includes(node.id) || selectedNodeId === node.id}
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
      <SandboxMetricsPanel metrics={metrics} />

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
        onAppendBlueprint={handleAppendBlueprint}
        onSaveCurrentSuccess={handleSaveCurrentSuccess}
      />

    </div>
  );
};
