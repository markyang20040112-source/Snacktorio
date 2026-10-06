// 品質閘門：npm run check（tsc 之後執行）
//   1. 資料 lint：被引用的名稱必須存在、跨表一致、無重複、無新的「只差一字」可疑名稱
//   2. 程式守門：src 內禁止新增硬編碼物品名稱字串；單檔行數上限
//   3. 回歸指紋：solver 1008 + 沙盒 378 案例的計算結果雜湊，必須與 fingerprints.json 一致
// 刻意改變計算結果 / 接受新名稱時：npm run baseline，並在 commit 訊息寫「BASELINE: 原因」。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = join(import.meta.dirname, '..', '..');
const BASELINE_FILE = join(import.meta.dirname, 'baseline.json');
const FP_FILE = join(import.meta.dirname, 'fingerprints.json');
const UPDATE = process.argv.includes('--update-baseline');
const LINE_LIMIT = 800;
const ENV_FLUIDS = ['水', '油', '虛空'];

interface Baseline {
  placeholders: string[];          // 刻意存在的佔位名稱（不需登錄於 items.json）
  iconAliases?: string[];          // itemIcons 中供工序名稱找圖示的別名（不是物品，經使用者確認保留）
  knownDataIssues: string[];       // 既有、待使用者確認的資料問題：只警告；此清單只能縮減，不能用 baseline 新增
  reviewedSimilarNames: string[];  // 已確認確實是不同物品的「只差一字」名稱
  lineCounts: Record<string, number>;
  hardcodedNames: Record<string, string[]>;
}

const errors: string[] = [];
const warnings: string[] = [];
const fail = (msg: string) => errors.push(msg);
const load = (f: string) => JSON.parse(readFileSync(join(ROOT, 'src', 'data', `${f}.json`), 'utf8'));
const readJson = <T>(p: string, fallback: T): T => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const baseline = readJson<Baseline>(BASELINE_FILE,
  { placeholders: [], knownDataIssues: [], reviewedSimilarNames: [], lineCounts: {}, hardcodedNames: {} });
const knownIssues = new Set(baseline.knownDataIssues || []);
const seenKnownIssues = new Set<string>();
/** 資料錯誤：既有已知問題降為警告，新問題一律失敗（npm run baseline 也無法接受） */
const failData = (msg: string) => {
  if (knownIssues.has(msg)) { warnings.push(msg); seenKnownIssues.add(msg); } else fail(`[資料] ${msg}`);
};

// ───────────────────────── 1. 資料 lint ─────────────────────────
const items: any[] = load('items');
const machines: any[] = load('machines');
const inter: any[] = load('intermediateRecipes');
const recipes: any[] = load('recipes');
const calc: any = load('calculatorDb');
const icons: Record<string, string> = load('itemIcons');

const itemNames = new Set(items.map(i => i.name));
const machineNames = new Set(machines.map(m => m.name));
const interNames = new Set(inter.map(r => r.name));
const recipeNames = new Set(recipes.map(r => r.name));
const placeholders = new Set(baseline.placeholders);
const known = new Set([...itemNames, ...interNames, ...recipeNames, ...placeholders]);

// 中間配方允許同名（替代配方，例：青醬有兩種原料組合），但機台與輸入完全相同即為重複
const interKey = (r: any) => `${r.name}|${r.machine}|${(r.inputs || []).map((i: any) => `${i.name}*${i.count}`).join(',')}`;
for (const [label, list, key] of [
  ['items', items, (o: any) => o.name], ['machines', machines, (o: any) => o.name],
  ['intermediateRecipes', inter, interKey], ['recipes', recipes, (o: any) => o.name],
] as const) {
  const seen = new Set<string>();
  for (const o of list) {
    if (seen.has(key(o))) failData(`${label}.json 名稱重複：「${o.name}」`);
    seen.add(key(o));
  }
}

const isEmptyRef = (n: unknown) => n == null || n === '' || n === '無' || n === '-';
const ref = (name: unknown, where: string, pool: Set<string> = known) => {
  if (isEmptyRef(name)) return;
  if (!pool.has(name as string)) failData(`${where} 引用了不存在的名稱「${name}」`);
};

for (const [label, list] of [['食譜', recipes], ['中間配方', inter]] as const) {
  for (const r of list) {
    (r.inputs || []).forEach((i: any) => ref(i.name, `${label}「${r.name}」的輸入`));
    ref(r.fluidType, `${label}「${r.name}」的液體`);
    ref(r.machine, `${label}「${r.name}」的機台`, machineNames);
  }
}
for (const r of inter) if (!itemNames.has(r.name)) failData(`中間配方產物「${r.name}」未登錄於 items.json`);
for (const i of items) ref(i.spoilProduct, `食材「${i.name}」的腐壞產物`);
for (const p of calc.processes || []) {
  ref(p.dish, `計算機參數庫 processes 的料理`);
  ref(p.machine, `計算機參數庫 processes「${p.dish}/${p.processName}」的機台`, machineNames);
}
for (const m of calc.materials || []) {
  ref(m.dish, `計算機參數庫 materials 的料理`);
  ref(m.material, `計算機參數庫 materials「${m.dish}」的材料`);
}
// iconAliases：工序名稱去掉動作詞後用來找圖示的別名（例：「水煮通心粉」→「通心粉」），經使用者確認保留
const iconPool = new Set([...itemNames, ...interNames, ...machineNames, ...placeholders, ...(baseline.iconAliases || [])]);
for (const k of Object.keys(icons)) {
  if (recipeNames.has(k) && !itemNames.has(k)) failData(`itemIcons.json 收錄了終端料理「${k}」（圖片簡化原則禁止）`);
  else ref(k, 'itemIcons.json 的鍵', iconPool);
}

// 疑似錯字的名稱：(1) 只差一個字；(2) 把同音 / 形近字視為同一字後完全相同（例：致命沙沙醬 / 致命莎莎醬、刺波羅樹 / 刺菠蘿樹）
const CONFUSABLE: Record<string, string> = {
  莎: '沙', 菠: '波', 蘿: '羅', 糰: '團', 荳: '豆', 污: '汙', 面: '麵', 薑: '姜', 臺: '台', 裏: '裡', 着: '著', 乾: '干',
};
const norm = (s: string) => [...s].map(c => CONFUSABLE[c] || c).join('');
const allNames = [...new Set([...itemNames, ...interNames, ...recipeNames, ...machineNames])].sort();
const similarPairs: string[] = [];
for (let i = 0; i < allNames.length; i++) for (let j = i + 1; j < allNames.length; j++) {
  const a = allNames[i], b = allNames[j];
  if (a.length !== b.length) continue;
  if (norm(a) === norm(b)) { similarPairs.push(`${a} ↔ ${b}`); continue; }
  if (a.length < 3) continue;
  let d = 0;
  for (let k = 0; k < a.length && d < 2; k++) if (a[k] !== b[k]) d++;
  if (d === 1) similarPairs.push(`${a} ↔ ${b}`);
}
const reviewed = new Set(baseline.reviewedSimilarNames);
// 本機（AI 提交前）視為錯誤；CI（可能是使用者從網頁工作台同步的資料）只警告，不阻擋部署
const IN_CI = process.env.CI === 'true';
for (const p of similarPairs) if (!reviewed.has(p)) {
  const msg = `[名稱] 新出現只差一個字的名稱：${p}（若是錯字請統一；若確實是不同物品，經使用者確認後 npm run baseline 並於 commit 註明）`;
  if (IN_CI) warnings.push(msg); else fail(msg);
}

// ───────────────────────── 2. 程式守門 ─────────────────────────
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (n === 'data' ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const srcFiles = walk(join(ROOT, 'src')).map(p => relative(ROOT, p).replace(/\\/g, '/')).sort();

const guardedNames = new Set([...itemNames, ...interNames, ...recipeNames].filter(n => !machineNames.has(n) && !ENV_FLUIDS.includes(n) && !placeholders.has(n)));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const lineCounts: Record<string, number> = {};
const hardcoded: Record<string, string[]> = {};

for (const f of srcFiles) {
  const text = readFileSync(join(ROOT, f), 'utf8');
  const lines = text.split('\n').length;
  const limit = Math.max(LINE_LIMIT, baseline.lineCounts[f] ?? 0);
  if (lines > LINE_LIMIT) lineCounts[f] = lines;
  if (lines > limit) fail(`[程式] ${f} 有 ${lines} 行，超過上限 ${limit}，請拆分成較小的模組`);

  const found: string[] = [];
  for (const m of stripComments(text).matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    if (m[1] === '`' && m[2].includes('${')) continue;
    if (guardedNames.has(m[2])) found.push(m[2]);
  }
  if (found.length) hardcoded[f] = found.sort();

  const allowed = new Map<string, number>();
  for (const n of baseline.hardcodedNames[f] || []) allowed.set(n, (allowed.get(n) || 0) + 1);
  const added = new Map<string, number>();
  for (const n of found) {
    const left = allowed.get(n) || 0;
    if (left > 0) allowed.set(n, left - 1); else added.set(n, (added.get(n) || 0) + 1);
  }
  if (added.size) fail(`[程式] ${f} 新增了硬編碼物品名稱：${[...added.keys()].map(n => `「${n}」`).join('、')}。` +
    `物品分類請由 src/data/*.json 推導（見 src/utils/itemTraits.ts），勿在程式寫死名稱`);

  // 未指定語系的 localeCompare / toLocaleString 會依作業系統語言產生不同排序或格式（不同電腦、CI 結果不一致）
  stripComments(text).split('\n').forEach((line, i) => {
    if (/\.localeCompare\(\s*[^,()]*(\([^()]*\))?[^,()]*\)/.test(line) || /\.toLocale(String|DateString|TimeString)\(\s*\)/.test(line)) {
      fail(`[程式] ${f}:${i + 1} 使用未指定語系的 localeCompare / toLocaleString，請明確指定（例：a.localeCompare(b, 'zh-Hant')）`);
    }
  });
}

// ───────────────────────── 3. 回歸指紋 ─────────────────────────
const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined && typeof o[k] !== 'function').sort()
    .map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
};
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const hashAll = (cases: Record<string, unknown>) => Object.fromEntries(Object.keys(cases).sort().map(k => [k, sha(canonical(cases[k]))]));
// 資料指紋：以解析後的 JSON 計算，不受換行符（CRLF/LF）與排版影響
const dataDir = join(ROOT, 'src', 'data');
const dataHash = sha(readdirSync(dataDir).filter(n => n.endsWith('.json')).sort()
  .map(n => `${n}:${canonical(JSON.parse(readFileSync(join(dataDir, n), 'utf8')))}`).join('\n'));

// dataService 在 Node 環境找不到 localStorage 會印出提示，屬正常現象，這裡暫時靜音
const origError = console.error, origWarn = console.warn;
console.error = console.warn = () => {};
const { buildSolverCases, buildSandboxCases } = await import('../regression/cases');
const fingerprints = { dataHash, solver: hashAll(buildSolverCases()), sandbox: hashAll(buildSandboxCases()) };
console.error = origError; console.warn = origWarn;

const oldFp = readJson<{ dataHash?: string; solver?: Record<string, string>; sandbox?: Record<string, string> }>(FP_FILE, {});
if (oldFp.dataHash && oldFp.dataHash !== dataHash) {
  // 資料檔本身變了（使用者在網頁工作台編輯並同步 / 登錄新食譜）：計算結果本來就會變，屬刻意變更，不阻擋部署
  warnings.push('src/data 已在基準建立後被修改（例如網頁工作台同步），本次略過回歸指紋比對。' +
    '請在「不修改程式」的狀態下執行 npm run baseline，commit 訊息寫「BASELINE: 同步資料更新」，再進行程式修改');
} else for (const group of ['solver', 'sandbox'] as const) {
  const a = oldFp[group] || {}, b = fingerprints[group];
  const changed = Object.keys(b).filter(k => k in a && a[k] !== b[k]);
  const added = Object.keys(b).filter(k => !(k in a));
  const removed = Object.keys(a).filter(k => !(k in b));
  if (changed.length + added.length + removed.length === 0) continue;
  const show = (l: string[]) => l.slice(0, 8).join('\n      ') + (l.length > 8 ? `\n      …(+${l.length - 8})` : '');
  fail(`[回歸] ${group} 計算結果與基準不同：變更 ${changed.length}、新增 ${added.length}、移除 ${removed.length}` +
    (changed.length ? `\n    變更：\n      ${show(changed)}` : '') +
    (added.length ? `\n    新增：\n      ${show(added)}` : '') +
    (removed.length ? `\n    移除：\n      ${show(removed)}` : '') +
    `\n    若是重構，代表行為被改變了，請修正程式；若是刻意修改（公式調整 / 使用者要求的行為變更），請 npm run baseline 並在 commit 訊息寫「BASELINE: 原因」` +
    `\n    需要逐欄比對時：npx tsx scripts/regression/snapshot.ts 前後各跑一次，再用 compare.mjs`);
}

// ───────────────────────── 結果 ─────────────────────────
const summary = `solver ${Object.keys(fingerprints.solver).length} / sandbox ${Object.keys(fingerprints.sandbox).length} 案例，` +
  `${srcFiles.length} 個程式檔，${allNames.length} 個名稱`;

const warnText = warnings.length
  ? `\n⚠ 警告 ${warnings.length} 項（不阻擋，但應盡快處理；既有資料問題需使用者確認，見 baseline.json 的 knownDataIssues）：\n- ${warnings.join('\n- ')}\n`
  : '';

if (UPDATE) {
  const next: Baseline = {
    placeholders: baseline.placeholders,
    iconAliases: baseline.iconAliases || [],
    knownDataIssues: (baseline.knownDataIssues || []).filter(m => seenKnownIssues.has(m)), // 已修正者自動移除
    reviewedSimilarNames: similarPairs,
    lineCounts,
    hardcodedNames: hardcoded,
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + '\n');
  writeFileSync(FP_FILE, JSON.stringify(fingerprints, null, 1) + '\n');
  const remaining = errors.filter(e => e.startsWith('[資料] '));
  console.log(`✔ 已更新基準（${summary}）。請在 commit 訊息寫「BASELINE: 原因」。`);
  if (remaining.length) {
    console.log(`\n✘ 以下資料錯誤無法用基準接受，仍須修正：\n- ${remaining.join('\n- ')}`);
    process.exit(1);
  }
} else if (errors.length) {
  console.log(`✘ 品質檢查未通過（${errors.length} 項）：\n\n- ${errors.join('\n- ')}\n${warnText}`);
  process.exit(1);
} else {
  console.log(`${warnText}✔ 品質檢查通過（${summary}）`);
}
