import { SandboxNodeData, SandboxConnection } from './sandboxTypes';
import { normalizeItemName, isItemMatch } from './sandboxPhysics';

/**
 * 物品分流器專屬物理 (Splitter)：支援 1 進 2 出 或 1 進 3 出，支援均分模式與自訂流量模式
 */
export function updateSplitterNode(
  node: SandboxNodeData,
  incoming: SandboxConnection[]
): void {
  const inPort = node.inputs[0];
  const incomingConns = inPort ? incoming.filter(c => c.toPortId === inPort.id) : [];
  const inRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);
  const outCount = Math.max(1, node.outputs.length);

  if (incomingConns.length > 0 && inRate > 0) {
    // 檢查是否有多種不同物料混入同一個分流器 (Contamination Check)
    const incomingItemNames = Array.from(new Set(
      incomingConns
        .map(c => normalizeItemName(c.itemOrFluidName))
        .filter(n => n.length > 0 && n !== '物品' && n !== '分流物品')
    ));

    if (incomingItemNames.length > 1) {
      // 混流污染！停機並發出強烈警告
      node.efficiency = 0;
      node.solidSaturation = 0;
      node.fluidSaturation = 0;
      node.title = `分流器 (混流污染) · ${outCount}出`;
      node.statusNote = `❌ 物料混流污染！同時混入：${incomingItemNames.join('、')}（嚴禁混流，設備停機）`;
      if (inPort) {
        inPort.name = '混流污染';
        inPort.rateReceived = Number(inRate.toFixed(2));
        inPort.isDeficit = true;
      }
      node.outputs.forEach(p => {
        p.name = '混流污染';
        p.rateProvided = 0;
      });
      return;
    }

    const rawItemName = incomingItemNames[0] || incomingConns[0].itemOrFluidName || '物品';
    const itemName = normalizeItemName(rawItemName);

    node.efficiency = 1.0;
    node.solidSaturation = 1.0;
    node.fluidSaturation = 1.0;
    node.title = `分流器 (${itemName}) · ${outCount}出`;

    if (inPort) {
      inPort.name = itemName;
      inPort.rateReceived = Number(inRate.toFixed(2));
      inPort.isDeficit = false;
      delete inPort.rateRequired;
    }

    if (node.splitterMode === 'custom') {
      // 自訂輸出比例模式 (Ratio-based)：依各出口設定之權重比例分流 (如 2:1 或 1:2:1)
      const rawRatios = (node.splitterRatios && node.splitterRatios.length === outCount)
        ? node.splitterRatios
        : (node.splitterCustomRates && node.splitterCustomRates.length === outCount
            ? node.splitterCustomRates
            : node.outputs.map(() => 1));

      const sumRatios = rawRatios.reduce((s, r) => s + (r > 0 ? r : 0), 0);
      
      node.outputs.forEach((p, idx) => {
        const weight = rawRatios[idx] > 0 ? rawRatios[idx] : 0;
        const frac = sumRatios > 0 ? weight / sumRatios : (1 / outCount);
        const percent = (frac * 100).toFixed(0);
        const label = String.fromCharCode(65 + idx);
        p.name = `${itemName} (${label}: ${percent}%)`;
        p.rateProvided = Number((inRate * frac).toFixed(4));
      });

      const ratioStr = rawRatios.map(r => Number(r.toFixed(2))).join(' : ');
      const percentStr = rawRatios.map(r => sumRatios > 0 ? `${((r / sumRatios) * 100).toFixed(1)}%` : `${(100 / outCount).toFixed(1)}%`).join(' : ');
      node.statusNote = `📐 比例分流 (${ratioStr} ➔ ${percentStr})：進 ${inRate.toFixed(2)}/s，各路 [${node.outputs.map(p => p.rateProvided).join(', ')}]/s`;
    } else {
      // 均分模式：1:1(:1) 均等分流
      const frac = 1 / outCount;
      const percent = (frac * 100).toFixed(0);
      const outPerPort = Number((inRate * frac).toFixed(4));
      node.outputs.forEach((p, idx) => {
        const label = String.fromCharCode(65 + idx);
        p.name = `${itemName} (${label}: ${percent}%)`;
        p.rateProvided = outPerPort;
      });
      node.statusNote = `⚡ 均等分流中 (${outCount}出)：進 ${inRate.toFixed(2)}/s，各路 ${outPerPort}/s`;
    }
  } else {
    node.efficiency = 0;
    node.solidSaturation = 0;
    node.fluidSaturation = 0;
    node.title = `物品分流器 (${outCount}出)`;
    node.statusNote = incomingConns.length === 0 ? '⚠️ 未連接輸入物料' : '❌ 輸入流量為 0';
    if (inPort) {
      inPort.name = '待分流物料';
      inPort.rateReceived = 0;
      inPort.isDeficit = false;
      delete inPort.rateRequired;
    }
    node.outputs.forEach(p => {
      p.name = '分流物品';
      p.rateProvided = 0;
    });
  }
}

/**
 * 發酵變質 / 輸送緩衝方塊專屬物理 (Buffer / Fermentation)
 */
export function updateBufferDecayNode(
  node: SandboxNodeData,
  incoming: SandboxConnection[]
): void {
  const inPort = node.inputs[0];
  const incomingConns = inPort ? incoming.filter(c => c.toPortId === inPort.id) : [];
  const inRate = incomingConns.reduce((sum, c) => sum + c.actualFlowRate, 0);

  if (incomingConns.length > 0 && inRate > 0) {
    const firstConn = incomingConns[0];
    const rawName = normalizeItemName(firstConn.itemOrFluidName || '原料');
    const expectedName = inPort?.name || '原料';

    // 若節點明確指定了需求原料且不相符
    if (expectedName !== '原料' && expectedName !== '發酵原料' && !isItemMatch(rawName, expectedName, node, inPort?.id)) {
      node.efficiency = 0;
      node.solidSaturation = 0;
      node.fluidSaturation = 0;
      node.statusNote = `❌ 原料不符合：需求「${expectedName}」，但連入「${rawName}」`;
      if (inPort) {
        inPort.isDeficit = true;
        inPort.rateReceived = Number(inRate.toFixed(2));
      }
      node.outputs.forEach(p => { p.rateProvided = 0; });
      return;
    }

    // 若節點未指定食譜/成品，預設或沿用 output[0] 名稱
    const targetOutName = node.outputs[0]?.name || node.recipeName || rawName;

    node.efficiency = 1.0;
    node.solidSaturation = 1.0;
    node.fluidSaturation = 1.0;
    node.statusNote = `⏳ 發酵完成：${rawName} ➔ ${targetOutName} (${inRate.toFixed(2)}/s)`;

    // 產出率 100% 傳遞
    node.outputs.forEach(p => {
      p.rateProvided = Number(inRate.toFixed(3));
    });
  } else {
    node.efficiency = 0;
    node.solidSaturation = 0;
    node.fluidSaturation = 0;
    node.statusNote = incomingConns.length === 0 ? '⚠️ 待連接發酵前原料' : '❌ 輸入原料斷供 (0/s)';
    node.outputs.forEach(p => {
      p.rateProvided = 0;
    });
  }
}
