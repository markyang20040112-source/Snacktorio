import * as fs from 'fs';
import * as path from 'path';
import { 
  calculateSingleDish, 
  sortProcessesDownstreamToUpstream,
  getProcessOutputItem,
  getProcessInputItems
} from '../src/services/solver';
import { dataService } from '../src/services/dataService';
import { simulateSandboxPhysics } from '../src/components/Sandbox/sandboxPhysics';
import { 
  SandboxNodeData, 
  SandboxConnection, 
  SandboxBlueprint,
  PortDefinition 
} from '../src/components/Sandbox/sandboxTypes';
import { Recipe, IntermediateRecipe, Machine, Item } from '../src/types';

const dataDir = path.resolve(process.cwd(), 'src/data');
const recipes: Recipe[] = dataService.getRecipes();
const machines: Machine[] = dataService.getMachines();
const intermediateRecipes: IntermediateRecipe[] = dataService.getIntermediateRecipes();
const items: Item[] = dataService.getItems();

const allItemsSet = new Set<string>();
items.forEach(i => allItemsSet.add(i.name));
recipes.forEach(r => {
  allItemsSet.add(r.name);
  (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
  if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
});
intermediateRecipes.forEach(r => {
  allItemsSet.add(r.name);
  (r.inputs || []).forEach(inp => { if (inp.name && inp.name !== '無') allItemsSet.add(inp.name); });
  if (r.fluidType && r.fluidType !== '無') allItemsSet.add(r.fluidType);
});

// Map of spoil product transitions from items.json
const SPOIL_MAP = new Map<string, { product: string; time: number }>();
items.forEach(item => {
  if (item.isPerishable && item.spoilProduct) {
    SPOIL_MAP.set(item.name, { product: item.spoilProduct, time: Number(item.spoilTime) || 15 });
  }
});

function buildDishBlueprint(dish: Recipe, dishIndex: number): SandboxBlueprint {
  const res = calculateSingleDish(dish.name, 0.2, 'regular', 'dedicated');
  const procs = sortProcessesDownstreamToUpstream(res.processes);

  const nodes: SandboxNodeData[] = [];
  const connections: SandboxConnection[] = [];

  // Group processes by topological tier
  const maxTier = Math.max(...procs.map(p => p.tier || 0));

  // 1. Power Module: Generator + Coal Miner
  const genNodeId = `pwr-gen-${dishIndex}`;
  const coalMinerId = `pwr-coal-${dishIndex}`;

  const genNode: SandboxNodeData = {
    id: genNodeId,
    type: 'generator',
    title: '虛空熔爐 (4 FV/s)',
    machineName: '虛空熔爐',
    powerMode: 'regular',
    x: 60,
    y: 80,
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
  };

  const coalMinerNode: SandboxNodeData = {
    id: coalMinerId,
    type: 'machine',
    title: '採煤機 (供煤)',
    machineName: '採掘機',
    x: 60,
    y: 280,
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
    outputs: [{ id: 'out-煤炭', name: '煤炭', type: 'solid', rateProvided: 0.2 }]
  };

  nodes.push(genNode, coalMinerNode);
  connections.push({
    id: `c-pwr-coal-${dishIndex}`,
    fromNodeId: coalMinerId,
    fromPortId: 'out-煤炭',
    toNodeId: genNodeId,
    toPortId: 'in-coal',
    itemOrFluidName: '煤炭',
    type: 'solid',
    actualFlowRate: 0.1
  });

  // Track needed environment fluids (water, oil, void)
  const neededEnvFluids = new Set<string>();

  // 2. Instantiate Process Nodes
  const procNodeMap = new Map<string, SandboxNodeData>();
  const procOutputMap = new Map<string, { name: string; isFluid: boolean }>();
  const columnCounts = new Map<number, number>();

  let feederCount = 0;

  procs.forEach((p, pIdx) => {
    const tier = p.tier || 0;
    // tier 0 is rightmost (terminal), maxTier is leftmost
    const colIndex = maxTier - tier + 1; // 1 to maxTier + 1
    const rowInCol = columnCounts.get(colIndex) || 0;
    columnCounts.set(colIndex, rowInCol + 1);

    const x = 360 + colIndex * 340;
    const y = 80 + rowInCol * 260;

    const nodeId = `proc-${dishIndex}-${pIdx}`;
    const outputInfo = getProcessOutputItem(p, dish.name, intermediateRecipes, allItemsSet);
    procOutputMap.set(p.processName, outputInfo);

    let node: SandboxNodeData;

    if (p.machine === '自動廚師機') {
      const inputs: PortDefinition[] = [];
      dish.inputs.forEach(inp => {
        if (inp.name && inp.name !== '無' && inp.count > 0) {
          inputs.push({
            id: `in-${inp.name}`,
            name: inp.name,
            type: 'solid',
            rateRequired: Number((0.2 * inp.count).toFixed(2))
          });
        }
      });
      if (dish.fluidType && dish.fluidType !== '無') {
        inputs.push({
          id: `in-fluid-${dish.fluidType}`,
          name: dish.fluidType,
          type: 'fluid',
          rateRequired: dish.fluidRate || 1.0
        });
        if (['水', '油', '虛空'].includes(dish.fluidType)) {
          neededEnvFluids.add(dish.fluidType);
        }
      }

      node = {
        id: nodeId,
        type: 'machine',
        title: `自動廚師機 (${dish.name})`,
        machineName: '自動廚師機',
        recipeName: dish.name,
        targetRatePerMin: 12,
        x,
        y,
        baseCycleTime: dish.cycleTime || 5,
        baseOutputCount: dish.outputCount || 1,
        basePowerConsumption: 1.0,
        baseGoblins: 3,
        actualCycleTime: dish.cycleTime || 5,
        efficiency: 1.0,
        actualPower: 1.0,
        actualGoblins: 3,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs,
        outputs: [
          {
            id: `out-${dish.name}`,
            name: dish.name,
            type: 'solid',
            rateProvided: Number(((dish.outputCount || 1) / (dish.cycleTime || 5)).toFixed(3))
          }
        ]
      };
    } else {
      const inputInfos = getProcessInputItems(p, dish.name, procs, recipes, intermediateRecipes);
      const inputs: PortDefinition[] = [];

      inputInfos.forEach(inp => {
        // 注入機為原位轉化設備，絕不添加外採輸入管
        if (p.machine === '注入機' && inp.isFluid) return;

        inputs.push({
          id: inp.isFluid ? `in-fluid-${inp.name}` : `in-${inp.name}`,
          name: inp.name,
          type: inp.isFluid ? 'fluid' : 'solid',
          rateRequired: inp.isFluid ? 1.0 : Number((0.2 * (inp.count || 1)).toFixed(2))
        });
        if (inp.isFluid && ['水', '油', '虛空'].includes(inp.name)) {
          neededEnvFluids.add(inp.name);
        }
      });

      // Special handling for 物質操縱機
      if (p.machine === '物質操縱機') {
        neededEnvFluids.add('虛空');
        if (!inputs.some(inp => inp.name === '虛空')) {
          inputs.push({
            id: 'in-fluid-虛空',
            name: '虛空',
            type: 'fluid',
            rateRequired: 1.0
          });
        }
        if (!inputs.some(inp => inp.name === '重構底料' || inp.name === '任意物品')) {
          inputs.push({
            id: 'in-base',
            name: '重構底料',
            type: 'solid',
            rateRequired: 0.2
          });
        }
      }

      // Check if machine requires fluid from inter definition (not machine default!)
      const inter = intermediateRecipes.find(r => r.name === p.processName || r.name === outputInfo.name);
      if (inter && inter.fluidType && ['水', '油', '虛空'].includes(inter.fluidType) && p.machine !== '注入機') {
        neededEnvFluids.add(inter.fluidType);
        if (!inputs.some(inp => inp.name === inter.fluidType)) {
          inputs.push({
            id: `in-fluid-${inter.fluidType}`,
            name: inter.fluidType,
            type: 'fluid',
            rateRequired: inter.fluidRate || 1.0
          });
        }
      }

      // For fluid machines (like 攪拌機), default rate is 1.0 fl/s! For solid machines, capacity adapts to downstream demand
      const isFluidMach = outputInfo.isFluid;
      const initialRate = isFluidMach ? 1.0 : Math.max(0.2, (p.countRounded || 1) * (p.baseRate || 0.2));

      const mach = machines.find(m => m.name === p.machine) || { power: 1.0, goblins: 1 };
      const outputs: PortDefinition[] = [
        {
          id: `out-${outputInfo.name}`,
          name: outputInfo.name,
          type: outputInfo.isFluid ? 'fluid' : 'solid',
          rateProvided: Number(initialRate.toFixed(3))
        }
      ];

      node = {
        id: nodeId,
        type: 'machine',
        title: `${p.processName} (${p.machine})`,
        machineName: p.machine,
        recipeName: outputInfo.name,
        x,
        y,
        baseCycleTime: 5,
        baseOutputCount: Number((initialRate * 5).toFixed(2)),
        basePowerConsumption: mach.power,
        baseGoblins: mach.goblins,
        actualCycleTime: 5,
        efficiency: 1.0,
        actualPower: mach.power,
        actualGoblins: mach.goblins,
        fluidSaturation: 1.0,
        solidSaturation: 1.0,
        inputs,
        outputs
      };

      // If this machine consumes 重構底料 or 任意物品, generate a dedicated feeder harvester
      if (p.machine === '物質操縱機' || inputs.some(inp => inp.name === '重構底料' || inp.name === '任意物品')) {
        feederCount++;
        const feederId = `feeder-${dishIndex}-${feederCount}`;
        const targetBaseIn = inputs.find(inp => inp.name === '重構底料' || inp.name === '任意物品')!;
        const feederNode: SandboxNodeData = {
          id: feederId,
          type: 'machine',
          title: `底料作物採集 #${feederCount} (收割機)`,
          machineName: '收割機',
          x: x - 260,
          y: y + 90,
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
          outputs: [{ id: 'out-底料', name: targetBaseIn.name, type: 'solid', rateProvided: 0.2 }]
        };
        nodes.push(feederNode);

        connections.push({
          id: `c-feeder-${feederId}-${node.id}`,
          fromNodeId: feederId,
          fromPortId: 'out-底料',
          toNodeId: node.id,
          toPortId: targetBaseIn.id,
          itemOrFluidName: targetBaseIn.name,
          type: 'solid',
          actualFlowRate: 0.2
        });
      }
    }

    procNodeMap.set(p.processName, node);
    nodes.push(node);
  });

  // 3. Connect Downstream Targets for Process Nodes with Spoil / Fermentation buffer adaptation
  let bufferCount = 0;

  procs.forEach(p => {
    const sourceNode = procNodeMap.get(p.processName);
    const sourceOutInfo = procOutputMap.get(p.processName);
    if (!sourceNode || !sourceOutInfo || sourceNode.outputs.length === 0) return;

    const outPort = sourceNode.outputs[0];

    (p.downstreamTargets || []).forEach((target, tIdx) => {
      const targetNode = procNodeMap.get(target.processName);
      if (!targetNode) return;

      // 1. Direct Exact Match
      let inPort = targetNode.inputs.find(inp => inp.type === outPort.type && inp.name === outPort.name);

      if (inPort) {
        connections.push({
          id: `c-${sourceNode.id}-${targetNode.id}-${tIdx}`,
          fromNodeId: sourceNode.id,
          fromPortId: outPort.id,
          toNodeId: targetNode.id,
          toPortId: inPort.id,
          itemOrFluidName: inPort.name,
          type: outPort.type,
          actualFlowRate: Number((target.flowRate || inPort.rateRequired || 0.2).toFixed(3))
        });
        return;
      }

      // 2. Check 1-step Perishable Decay Transition (e.g. 麵包麵團 -> 發酵麵糰, 蛇蛋 -> 臭蛇蛋, 蟑螂奶油 -> 酸奶油)
      const step1 = SPOIL_MAP.get(outPort.name);
      if (step1) {
        inPort = targetNode.inputs.find(inp => inp.type === outPort.type && inp.name === step1.product);
        if (inPort) {
          bufferCount++;
          const bufId = `buf-${dishIndex}-${bufferCount}`;
          const flow = Number((target.flowRate || inPort.rateRequired || 0.2).toFixed(3));

          const bufferNode: SandboxNodeData = {
            id: bufId,
            type: 'buffer_decay',
            title: `發酵：${outPort.name} ➔ ${step1.product}`,
            machineName: '發酵緩衝',
            recipeName: step1.product,
            x: Math.round((sourceNode.x + targetNode.x) / 2),
            y: sourceNode.y + 40,
            baseCycleTime: step1.time,
            baseOutputCount: 1,
            basePowerConsumption: 0,
            baseGoblins: 0,
            actualCycleTime: step1.time,
            efficiency: 1.0,
            actualPower: 0,
            actualGoblins: 0,
            fluidSaturation: 1.0,
            solidSaturation: 1.0,
            inputs: [{ id: 'in-decay', name: outPort.name, type: 'solid', rateRequired: flow }],
            outputs: [{ id: 'out-decay', name: step1.product, type: 'solid', rateProvided: flow }]
          };
          nodes.push(bufferNode);

          connections.push({
            id: `c-to-buf-${bufId}`,
            fromNodeId: sourceNode.id,
            fromPortId: outPort.id,
            toNodeId: bufId,
            toPortId: 'in-decay',
            itemOrFluidName: outPort.name,
            type: 'solid',
            actualFlowRate: flow
          });

          connections.push({
            id: `c-from-buf-${bufId}`,
            fromNodeId: bufId,
            fromPortId: 'out-decay',
            toNodeId: targetNode.id,
            toPortId: inPort.id,
            itemOrFluidName: inPort.name,
            type: 'solid',
            actualFlowRate: flow
          });
          return;
        }

        // 3. Check 2-step Perishable Decay Transition (e.g. 軟質奶酪 -> 中等熟成奶酪 -> 硬質奶酪)
        const step2 = SPOIL_MAP.get(step1.product);
        if (step2) {
          inPort = targetNode.inputs.find(inp => inp.type === outPort.type && inp.name === step2.product);
          if (inPort) {
            bufferCount++;
            const buf1Id = `buf1-${dishIndex}-${bufferCount}`;
            const buf2Id = `buf2-${dishIndex}-${bufferCount}`;
            const flow = Number((target.flowRate || inPort.rateRequired || 0.2).toFixed(3));

            const buffer1: SandboxNodeData = {
              id: buf1Id,
              type: 'buffer_decay',
              title: `發酵：${outPort.name} ➔ ${step1.product}`,
              machineName: '發酵緩衝',
              recipeName: step1.product,
              x: sourceNode.x + 120,
              y: sourceNode.y + 40,
              baseCycleTime: step1.time,
              baseOutputCount: 1,
              basePowerConsumption: 0,
              baseGoblins: 0,
              actualCycleTime: step1.time,
              efficiency: 1.0,
              actualPower: 0,
              actualGoblins: 0,
              fluidSaturation: 1.0,
              solidSaturation: 1.0,
              inputs: [{ id: 'in-decay', name: outPort.name, type: 'solid', rateRequired: flow }],
              outputs: [{ id: 'out-decay', name: step1.product, type: 'solid', rateProvided: flow }]
            };

            const buffer2: SandboxNodeData = {
              id: buf2Id,
              type: 'buffer_decay',
              title: `發酵：${step1.product} ➔ ${step2.product}`,
              machineName: '發酵緩衝',
              recipeName: step2.product,
              x: sourceNode.x + 240,
              y: sourceNode.y + 40,
              baseCycleTime: step2.time,
              baseOutputCount: 1,
              basePowerConsumption: 0,
              baseGoblins: 0,
              actualCycleTime: step2.time,
              efficiency: 1.0,
              actualPower: 0,
              actualGoblins: 0,
              fluidSaturation: 1.0,
              solidSaturation: 1.0,
              inputs: [{ id: 'in-decay', name: step1.product, type: 'solid', rateRequired: flow }],
              outputs: [{ id: 'out-decay', name: step2.product, type: 'solid', rateProvided: flow }]
            };
            nodes.push(buffer1, buffer2);

            connections.push({
              id: `c-to-buf1-${buf1Id}`,
              fromNodeId: sourceNode.id,
              fromPortId: outPort.id,
              toNodeId: buf1Id,
              toPortId: 'in-decay',
              itemOrFluidName: outPort.name,
              type: 'solid',
              actualFlowRate: flow
            });
            connections.push({
              id: `c-buf1-to-buf2-${buf1Id}`,
              fromNodeId: buf1Id,
              fromPortId: 'out-decay',
              toNodeId: buf2Id,
              toPortId: 'in-decay',
              itemOrFluidName: step1.product,
              type: 'solid',
              actualFlowRate: flow
            });
            connections.push({
              id: `c-from-buf2-${buf2Id}`,
              fromNodeId: buf2Id,
              fromPortId: 'out-decay',
              toNodeId: targetNode.id,
              toPortId: inPort.id,
              itemOrFluidName: inPort.name,
              type: 'solid',
              actualFlowRate: flow
            });
            return;
          }
        }
      }
    });
  });

  // 4. Auto-complete any unsupplied input ports on all machines!
  let autoSuppCount = 0;
  nodes.forEach(node => {
    node.inputs.forEach(inPort => {
      const isConnected = connections.some(c => c.toNodeId === node.id && c.toPortId === inPort.id);
      if (!isConnected) {
        // Needs a supplier!
        // A. Check if an existing node outputs this exact item/fluid
        const existingSupplier = nodes.find(n => n.id !== node.id && n.outputs.some(p => p.name === inPort.name));
        if (existingSupplier) {
          const outP = existingSupplier.outputs.find(p => p.name === inPort.name)!;
          connections.push({
            id: `c-auto-${existingSupplier.id}-${node.id}-${inPort.id}`,
            fromNodeId: existingSupplier.id,
            fromPortId: outP.id,
            toNodeId: node.id,
            toPortId: inPort.id,
            itemOrFluidName: inPort.name,
            type: inPort.type,
            actualFlowRate: inPort.rateRequired || (inPort.type === 'fluid' ? 1.0 : 0.2)
          });
          return;
        }

        // B. Check if it's 粉塵: instantiate 研磨粉塵 + 採收粉塵底料
        if (inPort.name === '粉塵') {
          autoSuppCount++;
          const grinderId = `grind-dust-${dishIndex}-${autoSuppCount}`;
          const harvesterId = `harv-dust-${dishIndex}-${autoSuppCount}`;

          const grinderNode: SandboxNodeData = {
            id: grinderId,
            type: 'machine',
            title: '研磨粉塵 (研磨機)',
            machineName: '研磨機',
            recipeName: '粉塵',
            x: node.x - 300,
            y: node.y + 120,
            baseCycleTime: 5,
            baseOutputCount: 1,
            basePowerConsumption: 1.0,
            baseGoblins: 2,
            actualCycleTime: 5,
            efficiency: 1.0,
            actualPower: 1.0,
            actualGoblins: 2,
            fluidSaturation: 1.0,
            solidSaturation: 1.0,
            inputs: [{ id: 'in-粉塵底料', name: '粉塵底料', type: 'solid', rateRequired: 0.2 }],
            outputs: [{ id: 'out-粉塵', name: '粉塵', type: 'solid', rateProvided: 0.2 }]
          };

          const harvNode: SandboxNodeData = {
            id: harvesterId,
            type: 'machine',
            title: '採收粉塵底料 (收割機)',
            machineName: '收割機',
            x: node.x - 600,
            y: node.y + 120,
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
            outputs: [{ id: 'out-粉塵底料', name: '粉塵底料', type: 'solid', rateProvided: 0.2 }]
          };

          nodes.push(harvNode, grinderNode);

          connections.push({
            id: `c-harv-to-grind-${harvesterId}`,
            fromNodeId: harvesterId,
            fromPortId: 'out-粉塵底料',
            toNodeId: grinderId,
            toPortId: 'in-粉塵底料',
            itemOrFluidName: '粉塵底料',
            type: 'solid',
            actualFlowRate: 0.2
          });

          connections.push({
            id: `c-grind-to-node-${grinderId}`,
            fromNodeId: grinderId,
            fromPortId: 'out-粉塵',
            toNodeId: node.id,
            toPortId: inPort.id,
            itemOrFluidName: '粉塵',
            type: 'solid',
            actualFlowRate: inPort.rateRequired || 0.2
          });
          return;
        }

        // C. If solid raw ingredient: create dedicated raw harvester/miner
        if (inPort.type === 'solid') {
          autoSuppCount++;
          const rawSuppId = `raw-supp-${node.id}-${inPort.name}`;
          const isMiner = ['鹽', '煤炭', '鐵礦石', '黏土', '豆肉蔻', '香豆蔻'].includes(inPort.name);
          const machName = isMiner ? '採掘機' : '收割機';

          const newRawNode: SandboxNodeData = {
            id: rawSuppId,
            type: 'machine',
            title: `${isMiner ? '開採' : '採收'}：${inPort.name}`,
            machineName: machName,
            x: node.x - 300,
            y: node.y + 130,
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
            outputs: [{ id: `out-${inPort.name}`, name: inPort.name, type: inPort.type, rateProvided: inPort.rateRequired || 0.2 }]
          };
          nodes.push(newRawNode);

          connections.push({
            id: `c-raw-supp-${rawSuppId}-${node.id}`,
            fromNodeId: rawSuppId,
            fromPortId: `out-${inPort.name}`,
            toNodeId: node.id,
            toPortId: inPort.id,
            itemOrFluidName: inPort.name,
            type: 'solid',
            actualFlowRate: inPort.rateRequired || 0.2
          });
        }
      }
    });
  });

  // 5. Environment Fluid Pools & Pumps (水, 油, 虛空)
  let envY = 480;
  neededEnvFluids.forEach(fluid => {
    // Collect all nodes needing this fluid
    const consumers = nodes.filter(n => n.inputs.some(inp => inp.type === 'fluid' && inp.name === fluid));
    if (consumers.length === 0) return;

    const pumpCapacity = consumers.length * 1.0;
    const isOc = pumpCapacity > 2.0;

    const poolId = `env-pool-${fluid}-${dishIndex}`;
    const pumpId = `pump-${fluid}-${dishIndex}`;

    const poolNode: SandboxNodeData = {
      id: poolId,
      type: 'environment_pool',
      title: `${fluid === '虛空' ? '虛空裂隙' : fluid + '池'} (自然源)`,
      machineName: '環境池',
      x: 60,
      y: envY,
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
      outputs: [{ id: `out-${fluid}`, name: fluid, type: 'fluid', rateProvided: 999 }]
    };

    const pumpNode: SandboxNodeData = {
      id: pumpId,
      type: 'pump',
      title: isOc ? `${fluid}抽取泵機 (⚡超頻 ${pumpCapacity} fl/s)` : `${fluid}抽取泵機 (常規 2 fl/s)`,
      machineName: '虛空泵機',
      powerMode: isOc ? 'overclock' : 'regular',
      x: 60,
      y: envY + 160,
      baseCycleTime: 1,
      baseOutputCount: pumpCapacity,
      basePowerConsumption: isOc ? 2.0 : 1.0,
      baseGoblins: isOc ? 2 : 1,
      actualCycleTime: 1,
      efficiency: 1.0,
      actualPower: isOc ? 2.0 : 1.0,
      actualGoblins: isOc ? 2 : 1,
      fluidSaturation: 1.0,
      solidSaturation: 1.0,
      inputs: [
        { id: 'in-fluid', name: '原位轉化液/環境池', type: 'fluid', rateRequired: pumpCapacity },
        { id: 'in-sludge', name: '虛空汙泥 (超頻)', type: 'solid', rateRequired: 0.2 }
      ],
      outputs: [{ id: `out-${fluid}`, name: fluid, type: 'fluid', rateProvided: pumpCapacity }]
    };

    nodes.push(poolNode, pumpNode);

    // If overclocked, supply sludge
    if (isOc) {
      const sludgeMinerId = `sludge-${fluid}-${dishIndex}`;
      const sludgeNode: SandboxNodeData = {
        id: sludgeMinerId,
        type: 'machine',
        title: '物質操縱機 (空載凝結汙泥)',
        machineName: '物質操縱機',
        x: 60,
        y: envY + 320,
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
        outputs: [{ id: 'out-虛空汙泥', name: '虛空汙泥', type: 'solid', rateProvided: 0.2 }]
      };
      nodes.push(sludgeNode);

      connections.push({
        id: `c-sludge-to-pump-${fluid}-${dishIndex}`,
        fromNodeId: sludgeMinerId,
        fromPortId: 'out-虛空汙泥',
        toNodeId: pumpId,
        toPortId: 'in-sludge',
        itemOrFluidName: '虛空汙泥',
        type: 'solid',
        actualFlowRate: 0.2
      });
    }

    // Connect pool to pump
    connections.push({
      id: `c-pool-pump-${fluid}-${dishIndex}`,
      fromNodeId: poolId,
      fromPortId: `out-${fluid}`,
      toNodeId: pumpId,
      toPortId: 'in-fluid',
      itemOrFluidName: fluid,
      type: 'fluid',
      actualFlowRate: pumpCapacity
    });

    // Connect pump to consumers strictly needing this fluid
    consumers.forEach(n => {
      const fluidInPort = n.inputs.find(inp => inp.type === 'fluid' && inp.name === fluid);
      if (fluidInPort) {
        connections.push({
          id: `c-pump-${fluid}-to-${n.id}-${dishIndex}`,
          fromNodeId: pumpId,
          fromPortId: `out-${fluid}`,
          toNodeId: n.id,
          toPortId: fluidInPort.id,
          itemOrFluidName: fluid,
          type: 'fluid',
          actualFlowRate: fluidInPort.rateRequired || 1.0
        });
      }
    });

    envY += isOc ? 500 : 340;
  });

  // 6. Calibrate Output Port Capacities to Match Multiple Outgoing Connections
  // Due to Snacktorio Equal Fluid Sharing / Conveyor splitting law:
  // actualFlowPerConn = rateProvided / numConns
  // To avoid starvation when 1 port feeds N machines, rateProvided must be >= N * maxDemand
  nodes.forEach(n => {
    n.outputs.forEach(outPort => {
      const outConns = connections.filter(c => c.fromNodeId === n.id && c.fromPortId === outPort.id);
      if (outConns.length > 1) {
        // Calculate total required flow
        let totalReq = 0;
        outConns.forEach(c => {
          const targetN = nodes.find(target => target.id === c.toNodeId);
          const inP = targetN?.inputs.find(p => p.id === c.toPortId);
          totalReq += (inP?.rateRequired || (outPort.type === 'fluid' ? 1.0 : 0.2));
        });
        const safeRate = Number((outConns.length * Math.max(outPort.type === 'fluid' ? 1.0 : 0.2, totalReq / outConns.length)).toFixed(2));
        outPort.rateProvided = safeRate;
        n.baseOutputCount = Number((safeRate * n.baseCycleTime).toFixed(2));
      }
    });
  });

  // 7. Physics Simulation Verification
  const sim = simulateSandboxPhysics(nodes, connections);

  const blueprint: SandboxBlueprint = {
    id: `bp_dish_${dishIndex + 1}_${dish.name.replace(/\s+/g, '_')}`,
    name: `${dish.name} (標準產能 12份/分)`,
    description: `【${dish.island}】${dish.name} 完整自動化產線：包含原料採集、中間加工、專屬流體輸送與 4 FV/s 獨立發電閉環。`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pan: { x: 50, y: 50 },
    zoom: 0.85,
    stats: {
      machineCount: nodes.filter(n => n.type === 'machine' || n.type === 'generator' || n.type === 'pump').length,
      powerLoad: Number(sim.metrics.totalPowerLoad.toFixed(2)),
      mainDishes: [dish.name]
    },
    nodes: sim.updatedNodes,
    connections: sim.updatedConnections
  };

  return blueprint;
}

console.log('Building all 42 dish blueprints with auto-healed pipelines & zero-deficit verification...');
const allBlueprints: SandboxBlueprint[] = [];

// Also preserve starter generator blueprint
const existingBpPath = path.join(dataDir, 'sandboxBlueprints.json');
let existingBps: SandboxBlueprint[] = [];
if (fs.existsSync(existingBpPath)) {
  existingBps = JSON.parse(fs.readFileSync(existingBpPath, 'utf-8'));
}
const starterBp = existingBps.find(b => b.id === 'bp_starter_generator');
if (starterBp) {
  allBlueprints.push(starterBp);
}

let deficitDishes = 0;

recipes.forEach((dish, idx) => {
  const bp = buildDishBlueprint(dish, idx);
  allBlueprints.push(bp);

  const hasDeficit = bp.nodes.some(n => n.inputs.some(p => p.isDeficit));
  if (hasDeficit) {
    deficitDishes++;
    const defNodes = bp.nodes.filter(n => n.inputs.some(p => p.isDeficit));
    console.log(`⚠️ [${dish.name}] Deficit nodes (${defNodes.length}):`, defNodes.map(n => `${n.title} (${n.statusNote})`));
  } else {
    console.log(`✅ [${dish.name}] Perfect! 0 deficit, 100% efficient.`);
  }
});

console.log(`-----------------------------------------------`);
console.log(`Generated ${allBlueprints.length} blueprints total.`);
console.log(`Deficit dishes count: ${deficitDishes} / 42`);

fs.writeFileSync(existingBpPath, JSON.stringify(allBlueprints, null, 2), 'utf-8');
console.log(`Successfully written to ${existingBpPath}!`);
