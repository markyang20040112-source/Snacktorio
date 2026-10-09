import { ProcessNode, IntermediateRecipe, Item, FeederStrategy } from '../types';
import { isUpstreamAncestor, initReachabilityMap, canAddDependency, recordDependency } from '../utils/itemTraits';
import { computeIntegerRatio } from '../utils/math';

/**
 * Matches physical surplus byproduct flows to matter manipulators or base consumer machines
 * to offset redundant base feeder harvesters (feederStrategy === 'recycle').
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

  const nonDonorMachines = new Set([
    '自動廚師機',
    ...consumerMachines,
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
  ]);
  const candidateNodes = processNodes.filter(
    p =>
      !nonDonorMachines.has(p.machine) &&
      !intermediateRecipes.find(
        r =>
          (r.name === p.processName || p.processName.includes(r.name)) &&
          r.fluidType &&
          r.fluidType !== '無'
      ) &&
      p.countRounded > p.demandRate
  );

  // 標記提供過剩產能的供給設備 (Donor)
  const donorNodes = candidateNodes.filter(p => {
    const surplusRate = getSurplusRate(p, processNodes, intermediateRecipes);
    return surplusRate >= 0.199;
  });

  let totalOffsetAvailable = 0;
  const sources: string[] = [];

  donorNodes.forEach(p => {
    const surplusRate = getSurplusRate(p, processNodes, intermediateRecipes);
    const potential = Math.floor((surplusRate + 0.001) / 0.2);
    if (potential > 0) {
      totalOffsetAvailable += potential;
      sources.push(`【${p.processName}】過剩 ${surplusRate.toFixed(2)}/s`);
    }
  });

  if (totalOffsetAvailable <= 0) {
    return { offsetCount, offsetSource };
  }

  const manipulators = baseConsumerNodes;

  // 動態分析：判斷是否有候選過剩工序的原料鏈向上依賴本料理中的某台底料設備產物 (Chicken-and-Egg 死鎖防護)
  // 若依賴某台設備，該設備即為「起始啟動機 (Progenitor)」，必須保留其專屬底料收割機啟動鏈條
  const progenitorManipulators = manipulators.filter(m => {
    const mProduct = m.processName.replace('重構', '').replace('物質操縱', '').trim();
    return donorNodes.some(c => isUpstreamAncestor(c.processName, mProduct, intermediateRecipes, items));
  });

  const externalDonors = donorNodes.filter(
    d =>
      !manipulators.some(m =>
        isUpstreamAncestor(
          d.processName,
          m.processName.replace('重構', '').replace('物質操縱', '').trim(),
          intermediateRecipes,
          items
        )
      )
  );
  const extSlots = externalDonors.reduce(
    (s, d) => s + Math.floor((getSurplusRate(d, processNodes, intermediateRecipes) + 0.001) / 0.2),
    0
  );
  const needProgenitor = progenitorManipulators.length > 0 && extSlots < baseConsumerCount;
  const maxAllowed = needProgenitor ? Math.max(0, baseConsumerCount - 1) : baseConsumerCount;

  const canDonate = (donorNode: ProcessNode, recNode: ProcessNode) => {
    const recProduct = recNode.processName.replace('重構', '').replace('物質操縱', '').trim();
    return !isUpstreamAncestor(donorNode.processName, recProduct, intermediateRecipes, items);
  };

  const getDonorSupplier = (donorNode: ProcessNode) => {
    return manipulators.find(m => {
      const mProduct = m.processName.replace('重構', '').replace('物質操縱', '').trim();
      return isUpstreamAncestor(donorNode.processName, mProduct, intermediateRecipes, items);
    });
  };

  const candidateRoots = needProgenitor ? progenitorManipulators : (manipulators.length > 0 ? [manipulators[0]] : []);
  let bestMatching: {
    root: ProcessNode;
    matchedCount: number;
    donorSlots: { donor: ProcessNode; supplier?: ProcessNode; surplusRate: number; available: number; recipients: ProcessNode[] }[];
    score: number;
  } | null = null;

  for (const candRoot of candidateRoots) {
    const recipients = (needProgenitor ? manipulators.filter(m => m !== candRoot) : manipulators).slice(0, maxAllowed);
    const donorSlots = donorNodes.map(d => {
      const surplusRate = getSurplusRate(d, processNodes, intermediateRecipes);
      return {
        donor: d,
        supplier: getDonorSupplier(d),
        surplusRate,
        available: Math.floor((surplusRate + 0.001) / 0.2),
        recipients: [] as ProcessNode[]
      };
    });

    const reachMap = initReachabilityMap(manipulators.map(m => m.processName));
    recipients.sort(
      (a, b) =>
        donorSlots.filter(ds => canDonate(ds.donor, a)).length -
        donorSlots.filter(ds => canDonate(ds.donor, b)).length
    );

    let matchedCount = 0;
    for (const rec of recipients) {
      const available = donorSlots.filter(ds => {
        if (ds.available <= 0 || !canDonate(ds.donor, rec)) return false;
        if (ds.supplier && !canAddDependency(ds.supplier.processName, rec.processName, reachMap)) return false;
        return true;
      });
      if (available.length > 0) {
        available.sort(
          (d1, d2) =>
            recipients.filter(r => canDonate(d1.donor, r)).length -
            recipients.filter(r => canDonate(d2.donor, r)).length
        );
        const chosen = available[0];
        chosen.recipients.push(rec);
        chosen.available--;
        matchedCount++;
        if (chosen.supplier) {
          recordDependency(chosen.supplier.processName, rec.processName, reachMap);
        }
      }
    }

    const candRootSuppliesDonor = donorSlots.some(ds => ds.supplier === candRoot && ds.recipients.length > 0);
    const score = matchedCount * 100 + (candRootSuppliesDonor ? 10 : 0) + (50 - (candRoot.tier ?? 50));

    if (!bestMatching || score > bestMatching.score) {
      bestMatching = {
        root: candRoot,
        matchedCount,
        donorSlots,
        score
      };
    }
  }

  const donorSlots = bestMatching ? bestMatching.donorSlots : [];
  offsetCount = bestMatching ? Math.min(bestMatching.matchedCount, maxAllowed) : 0;

  if (offsetCount > 0) {
    const actualSources: string[] = [];
    donorSlots.forEach(ds => {
      const d = ds.donor;
      if (ds.recipients.length > 0) {
        d.feederRole = 'donor';
        const recNames = ds.recipients.map(r => `【${r.processName}】`).join('、');
        d.feederNote = `產能過剩，分流直供${recNames}作為底料 (${ds.surplusRate.toFixed(2)}/s)`;
        actualSources.push(`【${d.processName}】過剩直供${recNames}`);

        if (!d.downstreamTargets) d.downstreamTargets = [];
        ds.recipients.forEach(r => {
          d.downstreamTargets!.push({
            processName: r.processName,
            machine: r.machine,
            ratio: 1,
            flowRate: 0.20,
            isByproduct: true,
            note: '副產物折抵'
          });
          r.feederRole = 'recipient';
          r.feederNote = `底料由【${d.processName}】過剩產能直供 (省 1 底料機)`;
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
