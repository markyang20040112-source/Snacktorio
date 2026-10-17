import { Recipe } from '../types';
import { runParallelPlan, ConsolidatedPlan } from './parallelPlanner';
import { buildDishBlueprint } from './dishBlueprintGenerator';
import { simulateSandboxPhysics } from '../components/Sandbox/sandboxPhysics';
import { SandboxBlueprint, SandboxNodeData } from '../components/Sandbox/sandboxTypes';
import { dataService } from './dataService';

export type DiagnosticCode =
  | 'ERR_PROGENITOR_DEADLOCK'
  | 'ERR_FLUID_STARVATION'
  | 'ERR_HEAL_PATCH_TRIGGERED'
  | 'ERR_CHEF_STARVATION'
  | 'ERR_MACHINE_COUNT_MISMATCH'
  | 'ERR_BYPRODUCT_WIRING_MISMATCH';

export interface DigitalTwinFault {
  code: DiagnosticCode;
  title: string;
  message: string;
  remedy: string;
  nodeId?: string;
}

export interface Stage1MirrorReport {
  passed: boolean;
  calcMachineCount: number;
  sandboxMachineCount: number;
  machineCountMatched: boolean;
  byproductOffsetsMatched: boolean;
  details: string[];
}

export interface Stage2PhysicsReport {
  passed: boolean;
  chefEfficiency: number;
  healedNodeCount: number;
  deficitNodeCount: number;
  cyclesRun: number;
  stoppageNodes: string[];
  deficitNodes: { id: string; title: string; efficiency: number; missingDetail?: string }[];
  details: string[];
}

export interface DigitalTwinReport {
  dishName: string;
  isHealthy: boolean; // 🟢 true (健全) | 🔴 false (故障)
  stage1: Stage1MirrorReport;
  stage2: Stage2PhysicsReport;
  faults: DigitalTwinFault[];
  executionTimeMs: number;
}

export interface FullPlantAuditReport {
  totalDishes: number;
  healthyCount: number;
  faultyCount: number;
  results: DigitalTwinReport[];
  executionTimeMs: number;
}

/**
 * 第一關：靜態鏡像一致性審計 (Mirror Audit)
 * 比對計算機理論推導 vs 沙盒實體拓撲藍圖
 */
export function runMirrorAudit(
  plan: ConsolidatedPlan,
  blueprint: SandboxBlueprint
): { report: Stage1MirrorReport; faults: DigitalTwinFault[] } {
  const details: string[] = [];
  const faults: DigitalTwinFault[] = [];

  // 1. 加工與出餐機台數量對帳
  const theoryProcCount = plan.processes.reduce((sum, p) => sum + (p.parallelRounded || 0), 0);
  const sandboxProcNodes = blueprint.nodes.filter(
    n => n.id.startsWith('proc-') || n.id.startsWith('heal-') || n.id.startsWith('base-feeder-')
  );
  const sandboxProcCount = sandboxProcNodes.length;
  const machineCountMatched = theoryProcCount === sandboxProcCount;

  if (machineCountMatched) {
    details.push(`機台數量精確吻合：理論 ${theoryProcCount} 台 == 實體 ${sandboxProcCount} 台`);
  } else {
    details.push(`機台數量差異：理論 ${theoryProcCount} 台 != 實體 ${sandboxProcCount} 台`);
    faults.push({
      code: 'ERR_MACHINE_COUNT_MISMATCH',
      title: '機台數量鏡像不一致',
      message: `產線計算機理論需量為 ${theoryProcCount} 台，但沙盒投影實體為 ${sandboxProcCount} 台。`,
      remedy: '檢查 dishBlueprintGenerator.ts 實體機台實例化數量。'
    });
  }

  // 2. 副產物折抵連線對帳
  let byproductOffsetsMatched = true;
  const byproductTargets: { donorName: string; targetProcess: string; baseSlot?: number }[] = [];
  plan.processes.forEach(p => {
    (p.downstreamTargets || []).forEach(group => {
      (group.targets || []).forEach(t => {
        if (t.isByproduct) {
          byproductTargets.push({
            donorName: p.processName,
            targetProcess: t.processName,
            baseSlot: t.baseSlot
          });
        }
      });
    });
  });

  for (const bt of byproductTargets) {
    const donorNodes = blueprint.nodes.filter(n => n.title.includes(bt.donorName));
    const recNodes = blueprint.nodes.filter(n => n.title.includes(bt.targetProcess));
    const connFound = blueprint.connections.some(c =>
      donorNodes.some(dn => dn.id === c.fromNodeId) &&
      recNodes.some(rn => rn.id === c.toNodeId)
    );

    if (!connFound && donorNodes.length > 0 && recNodes.length > 0) {
      byproductOffsetsMatched = false;
      faults.push({
        code: 'ERR_BYPRODUCT_WIRING_MISMATCH',
        title: '副產物折抵連線缺失',
        message: `理論規劃【${bt.donorName}】直供【${bt.targetProcess}】，但實體拓撲中未建立副產物連線。`,
        remedy: '檢查 dishBlueprintGenerator.ts 之 solidTargets 副產物折抵配對。'
      });
    }
  }

  if (byproductTargets.length > 0) {
    details.push(`副產物折抵對帳：共 ${byproductTargets.length} 處折抵，連線${byproductOffsetsMatched ? '全部吻合' : '存在未對齊'}`);
  } else {
    details.push('副產物折抵對帳：本產線無副產物折抵');
  }

  const passed = machineCountMatched && byproductOffsetsMatched;

  return {
    report: {
      passed,
      calcMachineCount: theoryProcCount,
      sandboxMachineCount: sandboxProcCount,
      machineCountMatched,
      byproductOffsetsMatched,
      details
    },
    faults
  };
}

/**
 * 第二關：動態物理快進體檢 (Headless Physics Audit)
 * 背景快速收斂執行 60 週期，檢驗稼動率、自癒機台與停機節點
 */
export function runHeadlessPhysicsAudit(
  blueprint: SandboxBlueprint,
  maxIterations: number = 60
): { report: Stage2PhysicsReport; faults: DigitalTwinFault[] } {
  const details: string[] = [];
  const faults: DigitalTwinFault[] = [];

  // 深拷貝節點與連線以進行無 UI 物理演算
  const nodesClone: SandboxNodeData[] = JSON.parse(JSON.stringify(blueprint.nodes));
  const connsClone = JSON.parse(JSON.stringify(blueprint.connections));

  const simResult = simulateSandboxPhysics(nodesClone, connsClone);
  const updatedNodes = simResult.updatedNodes;

  // 1. 終端自動廚師機稼動率
  const chefNodes = updatedNodes.filter(n => n.machineName === '自動廚師機');
  const chefEfficiencies = chefNodes.map(n => n.efficiency);
  const minChefEff = chefEfficiencies.length > 0 ? Math.min(...chefEfficiencies) : 1.0;
  const chefEfficiencyPercent = Number((minChefEff * 100).toFixed(1));

  if (minChefEff >= 0.999) {
    details.push(`終端出餐稼動率 100.0% 滿載（共 ${chefNodes.length} 台自動廚師機）`);
  } else {
    details.push(`⚠️ 自動廚師機稼動率未吃滿：僅 ${chefEfficiencyPercent}%`);
    const starvedChef = chefNodes.find(n => n.efficiency < 0.999);
    faults.push({
      code: 'ERR_CHEF_STARVATION',
      title: '自動廚師機欠壓斷流',
      message: `【${starvedChef?.title || '自動廚師機'}】稼動率僅 ${chefEfficiencyPercent}%：${starvedChef?.statusNote || '物料不足'}`,
      remedy: '檢查主產線物料輸送帶是否有斷流或混管稀釋。',
      nodeId: starvedChef?.id
    });
  }

  // 2. 自癒補丁機台清零檢驗 (HealNodes == 0)
  const healedNodes = updatedNodes.filter(n => n.id.startsWith('heal-') || (n as any).isHealNode);
  if (healedNodes.length === 0) {
    details.push('自癒補丁機台數：0 台 (完全由資料庫推導自立運轉)');
  } else {
    details.push(`⚠️ 觸發了 ${healedNodes.length} 台自癒補丁機台！`);
    faults.push({
      code: 'ERR_HEAL_PATCH_TRIGGERED',
      title: '觸發自癒補丁機台',
      message: `系統產生了 ${healedNodes.length} 台自癒機台補丁（${healedNodes.map(n => n.title).join('、')}），代表理論推導或連線拓撲破防。`,
      remedy: '檢查 dishBlueprintGenerator.ts 是否有遺漏連線或流體未均分。'
    });
  }

  // 3. 停機節點檢測 (0% 稼動率)
  const stoppageNodes = updatedNodes
    .filter(n => n.type === 'machine' && n.efficiency === 0 && !n.id.startsWith('heal-'))
    .map(n => n.title);

  if (stoppageNodes.length > 0) {
    details.push(`⚠️ 存在 0% 停機設備：${stoppageNodes.join('、')}`);
    const firstStopNode = updatedNodes.find(n => stoppageNodes.includes(n.title));
    if (firstStopNode?.machineName === '物質操縱機') {
      faults.push({
        code: 'ERR_PROGENITOR_DEADLOCK',
        title: '物質操縱機 0% 停機 (祖源死鎖/斷料)',
        message: `【${firstStopNode.title}】完全停機：${firstStopNode.statusNote || '底料或流體斷流'}`,
        remedy: '檢查 isUpstreamAncestor 祖源防護與副產物啟動鏈條。',
        nodeId: firstStopNode.id
      });
    } else {
      faults.push({
        code: 'ERR_FLUID_STARVATION',
        title: `機台停機：${firstStopNode?.title}`,
        message: `【${firstStopNode?.title}】未接收到必要原料：${firstStopNode?.statusNote || '斷料'}`,
        remedy: '檢查上游設備輸出與連線。',
        nodeId: firstStopNode?.id
      });
    }
  }

  // 4. 欠壓節點檢測 (0 < efficiency < 99.9%)
  // 依據《二元健康狀態判定》：中間設備因離散整數特性向上取整未吃滿是合法預期的「產能餘裕」，不發 ERR_RATE_PENALTY
  const deficitNodes = updatedNodes
    .filter(n => n.type === 'machine' && n.efficiency > 0 && n.efficiency < 0.999 && !n.id.startsWith('heal-'))
    .map(n => ({
      id: n.id,
      title: n.title,
      efficiency: Number((n.efficiency * 100).toFixed(1)),
      missingDetail: n.statusNote
    }));

  if (deficitNodes.length > 0) {
    details.push(`產線整數餘裕：共 ${deficitNodes.length} 台中間設備隨需運轉 (稼動率介於 ${Math.min(...deficitNodes.map(d => d.efficiency))}% ~ ${Math.max(...deficitNodes.map(d => d.efficiency))}%)`);
  }

  const passed = minChefEff >= 0.999 && healedNodes.length === 0 && stoppageNodes.length === 0;

  return {
    report: {
      passed,
      chefEfficiency: chefEfficiencyPercent,
      healedNodeCount: healedNodes.length,
      deficitNodeCount: deficitNodes.length,
      cyclesRun: maxIterations,
      stoppageNodes,
      deficitNodes,
      details
    },
    faults
  };
}

/**
 * 執行單道料理之完整數位雙生閉環體檢 (Stage 1 + Stage 2)
 */
export function runDigitalTwinVerification(
  dishInput: Recipe | string,
  context?: {
    recipes?: Recipe[];
  }
): DigitalTwinReport {
  const startTime = performance.now();
  const recipes = context?.recipes || dataService.getRecipes();

  const dish = typeof dishInput === 'string'
    ? recipes.find(r => r.name === dishInput)
    : dishInput;

  if (!dish) {
    const execTime = Number((performance.now() - startTime).toFixed(2));
    return {
      dishName: typeof dishInput === 'string' ? dishInput : '未知料理',
      isHealthy: false,
      stage1: { passed: false, calcMachineCount: 0, sandboxMachineCount: 0, machineCountMatched: false, byproductOffsetsMatched: false, details: ['找不到該料理食譜'] },
      stage2: { passed: false, chefEfficiency: 0, healedNodeCount: 0, deficitNodeCount: 0, cyclesRun: 0, stoppageNodes: [], deficitNodes: [], details: ['未執行物理模擬'] },
      faults: [{ code: 'ERR_CHEF_STARVATION', title: '未找到料理食譜', message: `資料庫無此料理: ${dishInput}`, remedy: '確認食譜名稱' }],
      executionTimeMs: execTime
    };
  }

  // 1. 計算機理論推導
  const plan = runParallelPlan(
    [{ id: 'main', dishName: dish.name, rateMin: 12 }],
    'overclock',
    'recycle',
    recipes
  );

  // 2. 沙盒實體拓撲生成 (純投影；沿用上方同參數之規劃結果，免重複求解)
  const blueprint = buildDishBlueprint(dish, 0, { recipes, plan });

  // 3. 第一關：鏡像一致性審計
  const { report: stage1Report, faults: stage1Faults } = runMirrorAudit(plan.consolidated, blueprint);

  // 4. 第二關：動態物理快進體檢 (60 週期)
  const { report: stage2Report, faults: stage2Faults } = runHeadlessPhysicsAudit(blueprint, 60);

  const allFaults = [...stage1Faults, ...stage2Faults];
  const isHealthy = stage1Report.passed && stage2Report.passed && allFaults.length === 0;

  const executionTimeMs = Number((performance.now() - startTime).toFixed(2));

  return {
    dishName: dish.name,
    isHealthy,
    stage1: stage1Report,
    stage2: stage2Report,
    faults: allFaults,
    executionTimeMs
  };
}

/**
 * 執行全廠 42 道料理大體檢 (一鍵全廠數位雙生巡檢)
 */
export function runFullPlantAudit(recipesList?: Recipe[]): FullPlantAuditReport {
  const startTime = performance.now();
  const recipes = recipesList || dataService.getRecipes();

  const results: DigitalTwinReport[] = [];
  let healthyCount = 0;
  let faultyCount = 0;

  for (const dish of recipes) {
    const report = runDigitalTwinVerification(dish, { recipes });
    results.push(report);
    if (report.isHealthy) {
      healthyCount++;
    } else {
      faultyCount++;
    }
  }

  const executionTimeMs = Number((performance.now() - startTime).toFixed(2));

  return {
    totalDishes: recipes.length,
    healthyCount,
    faultyCount,
    results,
    executionTimeMs
  };
}
