import { ProcessNode, IntermediateRecipe, Item, FeederStrategy, ConsolidatedProcessRecord, DownstreamTarget } from '../types';
import { isUpstreamAncestor, initReachabilityMap, canAddDependency, recordDependency, isBasePlaceholder } from '../utils/itemTraits';
import { computeIntegerRatio } from '../utils/math';

/** 不作為副產物捐贈者之機台（呼叫端另加入該產線之底料消費機台） */
const NON_DONOR_MACHINES = [
  '自動廚師機',
  '物質操縱機',
  '攪拌機',
  '注入機',
  '虛空熔爐',
  '虛空泵機',
  '收割機',
  '採掘機',
  '發酵罐',
  '煮鍋',
  '油炸鍋',
  '烤箱',
  '混合機',
  '擠出機'
];

/** 工序對應之中間配方是否需要流體輸入（流體工序不作捐贈者） */
function hasFluidRecipe(processName: string, intermediateRecipes: IntermediateRecipe[]): boolean {
  return Boolean(intermediateRecipes.find(
    r =>
      (r.name === processName || processName.includes(r.name)) &&
      r.fluidType &&
      r.fluidType !== '無'
  ));
}

/** 將候選工序轉為捐贈者並濾除過剩產能不足 0.049/s 者 */
function buildDonorCandidates<T extends { processName: string; machine: string; tier?: number }>(
  candidates: T[],
  surplusOf: (p: T) => number
): ByproductDonorCandidate<T>[] {
  return candidates
    .map(p => ({
      donor: p,
      processName: p.processName,
      machine: p.machine,
      surplusRate: surplusOf(p),
      tier: p.tier
    }))
    .filter(d => d.surplusRate >= 0.049);
}

/** 捐贈者總過剩產能是否足以折抵至少 1 台底料機（整台或雙槽拼湊） */
function hasOffsetPotential<T>(donors: ByproductDonorCandidate<T>[]): boolean {
  const totalOffsetAvailable = donors.reduce((sum, d) => sum + Math.floor((d.surplusRate + 0.001) / 0.2), 0);
  const totalScrapSurplus = donors.reduce((sum, d) => sum + d.surplusRate, 0);
  return !(totalOffsetAvailable <= 0 && totalScrapSurplus < 0.199);
}

/** 全廠合併工序是否為底料消費者（物質操縱機，或中間配方輸入含底料佔位名稱） */
export function isBaseConsumerProcess(
  p: { machine: string; processName: string },
  intermediateRecipes: IntermediateRecipe[]
): boolean {
  if (p.machine === '物質操縱機') return true;
  if (p.machine === '烤箱') {
    const matchingInter = intermediateRecipes.find(r => r.machine === p.machine && (r.name === p.processName || p.processName.includes(r.name)));
    return matchingInter?.inputs?.some(inp => isBasePlaceholder(inp.name)) ?? false;
  }
  return false;
}

export interface ByproductDonorCandidate<T> {
  donor: T;
  processName: string;
  machine: string;
  surplusRate: number;
  tier?: number;
}

export interface ByproductRecipientCandidate<T> {
  rec: T;
  processName: string;
  machine: string;
  tier?: number;
}

export interface SolvedDonorAllocation<TDonor, TRec> {
  donor: TDonor;
  processName: string;
  machine: string;
  supplier?: { processName: string };
  surplusRate: number;
  recipients: TRec[];
  pairDonations: {
    rec: TRec;
    rate: number;
    slot: 1 | 2;
    partnerName: string;
    partnerRate: number;
  }[];
}

export interface BipartiteMatchingResult<TDonor, TRec> {
  offsetCount: number;
  maxAllowed: number;
  donorAllocations: SolvedDonorAllocation<TDonor, TRec>[];
}

/**
 * Core bipartite greedy matching solver for byproduct offsets.
 * Shared between single-dish solver and multi-dish parallel planner.
 */
export function solveBipartiteByproductMatching<TDonor, TRec>(
  donors: ByproductDonorCandidate<TDonor>[],
  recipients: ByproductRecipientCandidate<TRec>[],
  baseConsumerProcs: { processName: string; tier?: number }[],
  baseConsumerCount: number,
  intermediateRecipes: IntermediateRecipe[],
  items: Item[]
): BipartiteMatchingResult<TDonor, TRec> {
  if (donors.length === 0 || recipients.length === 0 || baseConsumerCount <= 0) {
    return { offsetCount: 0, maxAllowed: 0, donorAllocations: [] };
  }

  // 祖源判定 (純函式) 快取：donor 工序是否向上依賴 recipient 工序之產品 → 不可捐贈
  const donateCache = new Map<string, boolean>();
  const canDonateTo = (donorProc: string, recProc: string): boolean => {
    const key = `${donorProc}\u0000${recProc}`;
    let ok = donateCache.get(key);
    if (ok === undefined) {
      const recProduct = recProc.replace('重構', '').replace('物質操縱', '').trim();
      ok = !isUpstreamAncestor(donorProc, recProduct, intermediateRecipes, items);
      donateCache.set(key, ok);
    }
    return ok;
  };

  // 動態分析：判斷是否有候選過剩工序的原料鏈向上依賴底料設備產物 (Chicken-and-Egg 死鎖防護)
  const progenitorManipulators = baseConsumerProcs.filter(m =>
    donors.some(c => !canDonateTo(c.processName, m.processName))
  );

  const externalDonors = donors.filter(
    d => !baseConsumerProcs.some(m => !canDonateTo(d.processName, m.processName))
  );
  const extSlots = externalDonors.reduce(
    (s, d) => s + Math.floor((d.surplusRate + 0.001) / 0.2),
    0
  );
  const needProgenitor = progenitorManipulators.length > 0 && extSlots < baseConsumerCount;
  const maxAllowed = needProgenitor ? Math.max(0, baseConsumerCount - 1) : baseConsumerCount;

  const getDonorSupplier = (donor: ByproductDonorCandidate<TDonor>) => {
    return baseConsumerProcs.find(m => !canDonateTo(donor.processName, m.processName));
  };

  const candidateRoots = needProgenitor
    ? progenitorManipulators
    : (baseConsumerProcs.length > 0 ? [baseConsumerProcs[0]] : []);

  let bestMatching: {
    matchedCount: number;
    donorSlots: SolvedDonorAllocation<TDonor, TRec>[];
    score: number;
  } | null = null;

  for (const candRoot of candidateRoots) {
    let excludedOne = false;
    const filteredRecipients = (needProgenitor
      ? recipients.filter(r => {
          if (!excludedOne && r.processName === candRoot.processName) {
            excludedOne = true;
            return false;
          }
          return true;
        })
      : recipients
    ).slice(0, maxAllowed);

    const donorSlots: (SolvedDonorAllocation<TDonor, TRec> & {
      available: number;
      remSurplus: number;
    })[] = donors.map(d => ({
      donor: d.donor,
      processName: d.processName,
      machine: d.machine,
      supplier: getDonorSupplier(d),
      surplusRate: d.surplusRate,
      available: Math.floor((d.surplusRate + 0.001) / 0.2),
      remSurplus: d.surplusRate,
      recipients: [],
      pairDonations: []
    }));

    const reachMap = initReachabilityMap(baseConsumerProcs.map(m => m.processName));
    filteredRecipients.sort(
      (a, b) =>
        donorSlots.filter(ds => canDonateTo(ds.processName, a.processName)).length -
        donorSlots.filter(ds => canDonateTo(ds.processName, b.processName)).length
    );

    let matchedCount = 0;
    const unmatchedRecipients: ByproductRecipientCandidate<TRec>[] = [];

    // 第一優先（單源整台直供）：單一工序過剩 >= 0.20/s 者優先 1:1 直供單台操縱機 (佔用槽 1)
    for (const rec of filteredRecipients) {
      const available = donorSlots.filter(ds => {
        if (ds.available <= 0 || !canDonateTo(ds.processName, rec.processName)) return false;
        if (ds.supplier && !canAddDependency(ds.supplier.processName, rec.processName, reachMap)) return false;
        return true;
      });
      if (available.length > 0) {
        available.sort(
          (d1, d2) =>
            filteredRecipients.filter(r => canDonateTo(d1.processName, r.processName)).length -
            filteredRecipients.filter(r => canDonateTo(d2.processName, r.processName)).length
        );
        const chosen = available[0];
        chosen.recipients.push(rec.rec);
        chosen.available--;
        chosen.remSurplus -= 0.20;
        matchedCount++;
        if (chosen.supplier) {
          recordDependency(chosen.supplier.processName, rec.processName, reachMap);
        }
      } else {
        unmatchedRecipients.push(rec);
      }
    }

    // 第二優先（雙源拼湊折抵）：碎屑產能相互配對，滿足 rA + rB >= 0.20/s 直供單台操縱機之雙待消化槽
    for (const rec of unmatchedRecipients) {
      if (matchedCount >= maxAllowed) break;

      const scrapDonors = donorSlots.filter(ds => {
        if (ds.remSurplus < 0.049 || !canDonateTo(ds.processName, rec.processName)) return false;
        if (ds.supplier && !canAddDependency(ds.supplier.processName, rec.processName, reachMap)) return false;
        return true;
      });

      let foundPair: { d1: typeof donorSlots[0]; d2: typeof donorSlots[0]; r1: number; r2: number } | null = null;

      for (let i = 0; i < scrapDonors.length; i++) {
        for (let j = i + 1; j < scrapDonors.length; j++) {
          const d1 = scrapDonors[i];
          const d2 = scrapDonors[j];

          if (d1.remSurplus + d2.remSurplus >= 0.199) {
            let r1 = Number(Math.min(d1.remSurplus, 0.10).toFixed(2));
            if (r1 < 0.05) r1 = Number(d1.remSurplus.toFixed(2));
            let r2 = Number((0.20 - r1).toFixed(2));

            if (r2 <= d2.remSurplus + 0.005) {
              foundPair = { d1, d2, r1, r2 };
              break;
            } else if (d1.remSurplus >= 0.20 - d2.remSurplus - 0.005) {
              r2 = Number(Math.min(d2.remSurplus, 0.10).toFixed(2));
              r1 = Number((0.20 - r2).toFixed(2));
              if (r1 <= d1.remSurplus + 0.005) {
                foundPair = { d1, d2, r1, r2 };
                break;
              }
            }
          }
        }
        if (foundPair) break;
      }

      if (foundPair) {
        const { d1, d2, r1, r2 } = foundPair;
        d1.remSurplus -= r1;
        d2.remSurplus -= r2;
        d1.pairDonations.push({ rec: rec.rec, rate: r1, slot: 1, partnerName: d2.processName, partnerRate: r2 });
        d2.pairDonations.push({ rec: rec.rec, rate: r2, slot: 2, partnerName: d1.processName, partnerRate: r1 });
        if (d1.supplier) recordDependency(d1.supplier.processName, rec.processName, reachMap);
        if (d2.supplier) recordDependency(d2.supplier.processName, rec.processName, reachMap);
        matchedCount++;
      }
    }

    const candRootSuppliesDonor = donorSlots.some(
      ds => ds.supplier && ds.supplier.processName === candRoot.processName && (ds.recipients.length > 0 || ds.pairDonations.length > 0)
    );
    const score = matchedCount * 100 + (candRootSuppliesDonor ? 10 : 0) + (50 - (candRoot.tier ?? 50));

    if (!bestMatching || score > bestMatching.score) {
      bestMatching = {
        matchedCount,
        donorSlots,
        score
      };
    }
  }

  return {
    offsetCount: bestMatching ? Math.min(bestMatching.matchedCount, maxAllowed) : 0,
    maxAllowed,
    donorAllocations: bestMatching ? bestMatching.donorSlots : []
  };
}

/**
 * Matches physical surplus byproduct flows to matter manipulators or base consumer machines
 * to offset redundant base feeder harvesters (feederStrategy === 'recycle') for a single dish.
 */
export function matchByproductFeeders(
  processNodes: ProcessNode[],
  baseConsumerNodes: ProcessNode[],
  baseConsumerCount: number,
  consumerMachines: string[],
  feederStrategy: FeederStrategy,
  intermediateRecipes: IntermediateRecipe[],
  items: Item[],
  getSurplusRate: (
    proc: { processName: string; machine: string; countRounded?: number; parallelRounded?: number; totalDemandRate?: number; demandRate?: number },
    allProcesses: { processName: string; machine: string; countRounded?: number; parallelRounded?: number; totalDemandRate?: number; demandRate?: number }[],
    recipes: IntermediateRecipe[]
  ) => number
): { offsetCount: number; offsetSource: string } {
  let offsetCount = 0;
  let offsetSource = '';

  if (feederStrategy !== 'recycle' || baseConsumerCount <= 0) {
    return { offsetCount, offsetSource };
  }

  const nonDonorMachines = new Set([...NON_DONOR_MACHINES, ...consumerMachines]);
  const candidateNodes = processNodes.filter(
    p =>
      !nonDonorMachines.has(p.machine) &&
      !hasFluidRecipe(p.processName, intermediateRecipes) &&
      p.countRounded > p.demandRate
  );

  const donors = buildDonorCandidates(candidateNodes, p => getSurplusRate(p, processNodes, intermediateRecipes));
  if (!hasOffsetPotential(donors)) {
    return { offsetCount, offsetSource };
  }

  const recipients: ByproductRecipientCandidate<ProcessNode>[] = baseConsumerNodes.map(m => ({
    rec: m,
    processName: m.processName,
    machine: m.machine,
    tier: m.tier
  }));

  const result = solveBipartiteByproductMatching(
    donors,
    recipients,
    baseConsumerNodes,
    baseConsumerCount,
    intermediateRecipes,
    items
  );

  offsetCount = result.offsetCount;

  if (offsetCount > 0) {
    const actualSources: string[] = [];
    result.donorAllocations.forEach(ds => {
      const d = ds.donor;
      const hasSingle = ds.recipients.length > 0;
      const hasPair = ds.pairDonations.length > 0;

      if (hasSingle || hasPair) {
        d.feederRole = 'donor';
        const singleNames = ds.recipients.map(r => `【${r.processName}】`).join('、');
        const pairNames = ds.pairDonations.map(pd => `【${pd.rec.processName}】(雙槽折抵 ${pd.rate.toFixed(2)}/s)`).join('、');
        const allTargetLabels = [singleNames, pairNames].filter(Boolean).join('、');

        d.feederNote = `產能過剩，分流直供${allTargetLabels}作為底料 (${ds.surplusRate.toFixed(2)}/s)`;
        actualSources.push(`【${d.processName}】過剩直供${allTargetLabels}`);

        if (!d.downstreamTargets) d.downstreamTargets = [];

        // 1. 單源整台直供連線
        ds.recipients.forEach(r => {
          d.downstreamTargets!.push({
            processName: r.processName,
            machine: r.machine,
            ratio: 1,
            flowRate: 0.20,
            isByproduct: true,
            baseSlot: 1,
            note: '副產物折抵'
          });
          r.feederRole = 'recipient';
          r.feederNote = `底料由【${d.processName}】過剩產能直供 (省 1 底料機)`;
        });

        // 2. 雙源拼湊折抵連線
        ds.pairDonations.forEach(pd => {
          d.downstreamTargets!.push({
            processName: pd.rec.processName,
            machine: pd.rec.machine,
            ratio: 1,
            flowRate: pd.rate,
            isByproduct: true,
            baseSlot: pd.slot,
            note: `副產物雙槽折抵 (槽${pd.slot} ${pd.rate.toFixed(2)}/s)`
          });
          pd.rec.feederRole = 'recipient';
          pd.rec.feederNote = `底料由【${d.processName}】(${pd.rate.toFixed(2)}/s) 與【${pd.partnerName}】(${pd.partnerRate.toFixed(2)}/s) 雙槽拼湊直供 (省 1 底料機)`;
        });

        // 依據供餐需量與底料消耗之真實物理流率，動態重算分流配比 (最簡整數比)
        if (d.downstreamTargets.length > 1) {
          const allRates = d.downstreamTargets.map(t => (t.flowRate !== undefined ? t.flowRate : 0.20));
          const intRatios = computeIntegerRatio(allRates);
          d.downstreamTargets.forEach((t, idx) => {
            t.ratio = intRatios[idx];
          });
        }
      }
    });

    if (actualSources.length > 0) {
      offsetSource = `由${actualSources.join('、')} (折抵 ${offsetCount} 台)`;
    }
  }

  return { offsetCount, offsetSource };
}

/**
 * Matches physical surplus byproduct flows in multi-dish parallel planning across the whole plant.
 */
export function matchParallelByproductFeeders(
  list: ConsolidatedProcessRecord[],
  feederRow: ConsolidatedProcessRecord,
  intermediateRecipes: IntermediateRecipe[],
  items: Item[],
  getSurplusRate: (
    proc: ConsolidatedProcessRecord,
    allProcesses: ConsolidatedProcessRecord[],
    recipes: IntermediateRecipe[]
  ) => number
): void {
  if (!feederRow || !feederRow.baseFeederSummary || feederRow.parallelRounded <= 0) return;

  const bfSummary = feederRow.baseFeederSummary;
  const consumerName = bfSummary.consumerMachine || '物質操縱機';
  const nonDonorMachines = new Set([...NON_DONOR_MACHINES, consumerName]);

  // Clean previous feeder roles, dish demands, and byproduct downstream targets
  list.forEach(proc => {
    proc.feederRoles = [];
    if (proc.downstreamTargets) {
      proc.downstreamTargets.forEach(dt => {
        dt.targets = dt.targets.filter(t => !t.isByproduct);
      });
      proc.downstreamTargets = proc.downstreamTargets.filter(dt => dt.targets.length > 0);
    }
    if (proc.dishDemands) {
      proc.dishDemands.forEach(dd => {
        dd.feederRole = undefined;
        dd.feederNote = undefined;
      });
    }
  });

  const baseConsumerProcs = list.filter(p => isBaseConsumerProcess(p, intermediateRecipes));

  const recipientSlots: ByproductRecipientCandidate<ConsolidatedProcessRecord>[] = [];
  baseConsumerProcs.forEach(p => {
    const count = Math.max(1, p.parallelRounded || 1);
    for (let i = 0; i < count; i++) {
      recipientSlots.push({
        rec: p,
        processName: p.processName,
        machine: p.machine,
        tier: p.tier
      });
    }
  });

  const candidateNodes = list.filter(
    p =>
      !p.isBaseFeeder &&
      !nonDonorMachines.has(p.machine) &&
      !hasFluidRecipe(p.processName, intermediateRecipes) &&
      p.parallelRounded > p.totalDemandRate
  );

  const donors = buildDonorCandidates(candidateNodes, p => getSurplusRate(p, list, intermediateRecipes));
  if (!hasOffsetPotential(donors)) return;

  const result = solveBipartiteByproductMatching(
    donors,
    recipientSlots,
    baseConsumerProcs,
    feederRow.parallelRounded,
    intermediateRecipes,
    items
  );

  const offsetCount = result.offsetCount;

  if (offsetCount > 0) {
    result.donorAllocations.forEach(da => {
      const d = da.donor;
      const hasSingle = da.recipients.length > 0;
      const hasPair = da.pairDonations.length > 0;

      if (hasSingle || hasPair) {
        const singleNames = da.recipients.map(r => `【${r.processName}】`).join('、');
        const pairNames = da.pairDonations.map(pd => `【${pd.rec.processName}】(雙槽折抵 ${pd.rate.toFixed(2)}/s)`).join('、');
        const allTargetLabels = [singleNames, pairNames].filter(Boolean).join('、');

        d.feederRoles.push({
          dishName: '全廠',
          role: 'donor',
          note: `產能過剩，分流直供${allTargetLabels}作為底料 (${da.surplusRate.toFixed(2)}/s)`
        });

        if (!d.downstreamTargets) d.downstreamTargets = [];
        let plantTargetEntry = d.downstreamTargets.find(dt => dt.dishName === '全廠');
        if (!plantTargetEntry) {
          plantTargetEntry = { dishName: '全廠', targets: [] };
          d.downstreamTargets.push(plantTargetEntry);
        }

        // 1. 單源整台直供連線
        da.recipients.forEach(r => {
          plantTargetEntry!.targets.push({
            processName: r.processName,
            machine: r.machine,
            ratio: 1,
            flowRate: 0.20,
            isByproduct: true,
            baseSlot: 1,
            note: '副產物折抵'
          });
          r.feederRoles.push({
            dishName: '全廠',
            role: 'recipient',
            note: `底料由【${d.processName}】過剩產能直供 (省 1 底料機)`
          });
        });

        // 2. 雙源拼湊折抵連線
        da.pairDonations.forEach(pd => {
          plantTargetEntry!.targets.push({
            processName: pd.rec.processName,
            machine: pd.rec.machine,
            ratio: 1,
            flowRate: pd.rate,
            isByproduct: true,
            baseSlot: pd.slot,
            note: `副產物雙槽折抵 (槽${pd.slot} ${pd.rate.toFixed(2)}/s)`
          });
          pd.rec.feederRoles.push({
            dishName: '全廠',
            role: 'recipient',
            note: `底料由【${d.processName}】(${pd.rate.toFixed(2)}/s) 與【${pd.partnerName}】(${pd.partnerRate.toFixed(2)}/s) 雙槽拼湊直供 (省 1 底料機)`
          });
        });

        // 依據供餐需量與底料消耗之真實物理流率，動態重算分流配比 (最簡整數比)
        const allProcTargets: DownstreamTarget[] = [];
        d.downstreamTargets.forEach(dt => {
          dt.targets.forEach(t => allProcTargets.push(t));
        });
        if (allProcTargets.length > 1) {
          const allRates = allProcTargets.map(t => (t.flowRate !== undefined ? t.flowRate : 0.20));
          const intRatios = computeIntegerRatio(allRates);
          allProcTargets.forEach((t, idx) => {
            t.ratio = intRatios[idx];
          });
        }

        bfSummary.offsetDetails.push(`由【${d.processName}】過剩直供${allTargetLabels}`);
      }
    });

    bfSummary.offsetCount = offsetCount;
    feederRow.parallelRounded = Math.max(0, feederRow.parallelRounded - offsetCount);
    feederRow.totalDemandRate = feederRow.parallelRounded;
    bfSummary.finalCount = feederRow.parallelRounded;
  }
}
