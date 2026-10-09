# 專案開發進度與架構記憶 (Project Status & Architecture Memory)

> **提示**：本檔案由 AI Agent 與開發者共同維護，作為跨電腦切換與對話重啟時的即時記憶核心。
> 本檔僅保留「現況摘要 + 有效規則 + 近期決策」；**完整歷史決策逐字紀錄已移至 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)**。

---

## 1. 專案基本資訊 (Overview)
* **專案名稱**：《異食工廠》(Snacktorio) 產線平衡計算與資料管理系統
* **核心理念**：基於遊戲《異食工廠》建立全製程產線平衡推導、連續流體與即時電網配置、以及純文字資料驅動的 Web 應用與工作台。
* **建立日期**：2026-09-29
* **GitHub**：`markyang20040112-source/Snacktorio`（分支 `main`；Push 後由 `.github/workflows/deploy.yml` 自動部署至 GitHub Pages）

---

## 2. 技術棧與資料庫 (Tech Stack & Data)
* **Web 應用**：React 19 + Vite 6 + TypeScript + Tailwind CSS + Lucide Icons
  - ★ 自由沙盒模擬器：無限畫布節點連線、欠壓週期稀釋、無中生有測試、即時電網/流體儀表板。
  - 產線計算機：單料理動態推導、整數比、泵機階梯、發電熔爐閉環、生化隔離警示。
  - 多料理並聯規劃：任意道菜單並聯，跨料理共通設備去重合併。
  - 全能資料工作台：機器、食材生化、中間配方、終端食譜視覺化 CRUD；GitHub API 一鍵雲端同步。
* **純文字資料庫（單一事實來源，`src/data/`）**：

  | 檔案 | 內容 | 筆數 |
  |---|---|---|
  | `machines.json` | 機器設備 | 20 |
  | `items.json` | 食材與生化屬性 | 165 |
  | `intermediateRecipes.json` | 中間配方 | 65 |
  | `recipes.json` | 終端料理食譜 | 42 |
  | `calculatorDb.json` | 工序 409 / 流體需量 251 | — |
  | `itemIcons.json` | 圖標對照（不含終端菜餚） | 156 |
  | `sandboxBlueprints.json` | 沙盒自訂 / 修改專案（官方料理藍圖改為執行期自動生成，不存檔） | 0 |

* **Python（選用）**：僅 `scripts/github_push.py` 使用，且只用標準函式庫，**不需建立 `.venv`**；Web 應用只需要 Node.js。

---

## 3. 程式架構地圖 (Architecture Map)
| 路徑 | 職責 |
|---|---|
| `src/services/solver.ts` | 核心解算引擎：配方樹展開、`calculateSingleDish`、`sizeAutonomousPump`、`settlePlantInfrastructure`（泵機階梯 + 虛空閉環 + 電網，單一實作供單料理與並聯共用） |
| `src/services/byproductMatching.ts` | 泛用底料副產物折抵匹配（`matchByproductFeeders`）：二分圖槽位匹配 + 動態有向圖防死鎖 + 拓撲層級啟動鏈條 |
| `src/services/parallelPlanner.ts` | 多料理並聯純運算層（無 React）：`runParallelPlan`、`consolidatePlan` |
| `src/services/dataService.ts` | JSON 載入 / localStorage 快取 / 匯出 |
| `src/services/githubSync.ts` | Git Data API 單一原子 Commit 同步 5 份資料檔 + 沙盒藍圖庫（只推送自訂/修改過的藍圖；本機無藍圖時不推送該檔；無變更則略過） |
| `src/services/dishBlueprintGenerator.ts` | `buildDishBlueprint`：由資料庫自動推導任一食譜之完整沙盒產線（新食譜自動適配） |
| `src/services/builtInBlueprints.ts` | 官方料理藍圖執行期生成（依 `dataService.getRevision()` 快取）＋同步時剔除可重建藍圖 |
| `src/services/sandboxBlueprintService.ts` | 沙盒專案庫存取（官方藍圖與本機自訂專案合併、刪除/恢復/匯入匯出） |
| `src/components/ParallelPlanner/` | `ParallelPlanner.tsx`（控制台）+ `FluidStation` / `PowerStation` / `ProcessTable` / `KpiSummary` 顯示元件 |
| `src/components/Sandbox/` | `SandboxSimulator.tsx`（畫布狀態與互動）、`sandboxPhysics.ts`（物理引擎）、`sandboxDevicePhysics.ts`（分流器與緩衝發酵物理）、`sandboxNodeUtils.ts`（`makeNode` 節點工廠、校準、子圖複製、存檔）、`SandboxNode.tsx`、`SandboxBlueprintModal.tsx`（專案庫）、顯示元件 `SandboxCatalogSidebar` / `SandboxMetricsPanel` / `SandboxToolbar` / `SandboxConnectionsLayer`、`sandboxTypes.ts` |
| `src/components/DataManager/` | 資料工作台各管理分頁與同步設定 |
| `src/utils/itemTraits.ts` | 物品特性資料驅動判定：流體（食譜 `fluidType` 引用推導）、原料機台（`source`）、可發酵物品（`isPerishable`） |
| `src/utils/actionVerbs.ts` | 工序動作動詞共用正則（solver 與 iconHelper 共用） |
| `src/utils/` 其他 | `math.ts`（GCD/精度）、`iconHelper.ts`、`imageBeautifier.ts`、`machineBadge.ts` |
| `scripts/regression/` | 黃金快照回歸測試：`cases.ts`（案例定義，solver 1008 + 沙盒 378）、`snapshot.ts` / `sandboxSnapshot.ts`（輸出完整快照）、`compare.mjs` |
| `scripts/check/` | 品質閘門 `npm run check`：`index.ts`（資料 lint + 程式守門 + 回歸指紋）、`fingerprints.json`（每案例雜湊 + 資料雜湊）、`baseline.json`（佔位名、既有資料問題、已審核相似名、大檔行數、既有硬編碼名稱；只能縮減）、`installHooks.mjs`；hook 在 `.githooks/pre-commit` |
| `scripts/generateAllDishBlueprints.ts` | 以 `buildDishBlueprint` 生成全部料理藍圖並逐道回報缺料（預設只檢查，不寫入資料檔） |
| `docs/` | 知識庫（README、01 物理、02 公式、03 登錄 SOP、CHANGELOG 決策日誌） |

---

## 4. 有效規則與物理不變量 (Active Rules & Invariants)
> 以下為目前程式實際遵守之規則精華；細節與演進脈絡請查 `docs/01~03` 與 `docs/CHANGELOG.md`。

1. **自動廚師機**：最多 4 種固體（1:1:1:1）+ 1 種持續液體（1.0 fl/s）；產率 `0.2 × outputCount` 份/秒；出餐快捷鍵 12 / 24 / 36 份/分。
2. **流體泵機階梯**：超頻門檻「全廠有虛空產線 > 2 fl/s、無虛空 > 6 fl/s」；二級超頻虛空泵淨 7 fl/s（毛 8 − 汙泥自耗 1）、一級常規 2 fl/s；供液節點 $K = N_{1.0} + \lceil N_{0.5}/2 \rceil$，泵機需量 $\max(\text{BOM}, K)$。
3. **電網**：發電熔爐:採煤機 = 2:1（每台熔爐淨 3.5 FV/s）；二級超頻 2:1:1 模組（含供汙泥操縱機，淨 14 FV/s / 每 2 熔爐）。
4. **注入機原位轉化**：全廠單一環境池（每廠 1 台），抽取泵機依流體種類合併；不計入外採水/油管線。
5. **攪拌機**：額定 1.0 fl/s，1:1 獨立專線直供；不同流率嚴禁混管。
6. **熾熱配餐**：僅當終端料理本身含熾熱屬性時自動配對【胃復慘】（並聯時多道熾熱料理速率自動加總）。
7. **生化警示**：完全由 `items.json` 屬性驅動；「遇熱凝固」僅在產線存在熾熱物品時顯示；生熟物料嚴格隔離。
8. **底料供給策略**：專屬直供 / 智慧循環（祖源防護 + Round-Robin 個連一個配對）。
9. **圖示**：終端菜餚不建立圖示，一律以自動廚師機圖示或精簡徽章呈現。
10. **沙盒物理**：欠壓週期稀釋（週期等比拉長，不重複懲罰）、汙泥連線即超頻（供泥不足等比降載 sludgeSat = sludgeRate / 0.20）、注入機→抽取泵機原位規則、虛空汙泥空載凝結免底料、停機設備零產出強約束、四階段 DAG 拓撲結算。
11. **資料權威性**：`calculatorDb.json` 為工序/流體需量權威來源，配方樹生成器僅作後備（實測移除後 42 道中 35 道結果改變，不可刪）。
12. **浮點精度**：1/3、1/6、1/11、2/11 等循環小數以精準浮點 + GCD 處理。
13. **物品分類一律資料驅動（`utils/itemTraits.ts`，嚴禁 AI 推測或寫死名單）**：流體 = 水/油/虛空 + 被任何食譜引用為 `fluidType` 者；原料機台 = `items.json` 的 `source`；可發酵 = `isPerishable` 且有 `spoilProduct`。分類有誤時請修正資料，而非改程式。
14. **官方料理藍圖執行期生成**：不存檔於 `sandboxBlueprints.json`（該檔只存自訂/修改專案）；資料庫變動時自動重建；GitHub 同步只推送與自動生成版本不同的藍圖。

---

## 5. 開發與交接流程 (Dev Workflow)
* **環境**：Node.js 22（建議）→ `npm install` → `npm run dev`（開發）/ `npm run build`（建置）。
* **品質閘門（提交前必跑）**：`npm run check` = `tsc` + 資料 lint + 程式守門（硬編碼物品名 / 單檔 800 行上限）+ 回歸指紋（solver 1008 + 沙盒 378 案例）。`npm install` 會自動安裝 pre-commit hook；GitHub Actions 未通過則不部署。規則與失敗處理見 `AGENTS.md` 第 6 節。
* **刻意改變計算結果**（新食譜、公式調整）：`npm run baseline` → commit 訊息寫 `BASELINE: 原因`（CI 檢查）。網頁工作台同步資料後，下一次開發先單獨跑一次 baseline。
* **逐欄比對差異**（除錯用）：`npx tsx scripts/regression/snapshot.ts before.json` → 修改 → `after.json` → `node scripts/regression/compare.mjs before.json after.json`（沙盒用 `sandboxSnapshot.ts`）。React 介面不在快照範圍，需以 `npm run build` + 實機操作確認。
* **跨裝置轉移**：`git clone` / `git pull` → `npm install` → `npm run dev`。
  > ⚠️ 只存在瀏覽器 localStorage 的編輯不會跟著 Git 走，須先在工作台「GitHub 同步」推上去，或匯出 JSON 後提交。

---

## 6. 開發進度 (Roadmap)
- [x] Markdown 知識庫（`docs/`）、Excel/Word 全面退役，100% 純文字 JSON 驅動
- [x] React + Vite Web 應用：產線計算機、多料理並聯規劃、資料工作台、★ 自由沙盒模擬器
- [x] GitHub API 雲端同步與 GitHub Pages 自動部署
- [x] 程式瘦身重構（並聯規劃拆分、基建結算單一化、黃金快照回歸測試）
- [x] 沙盒 `isFluidItem` 名稱後綴推測改為資料庫驅動判定（13 種真實流體白名單、156 項物品校準）
- [x] 沙盒程式瘦身重構第二輪（SandboxSimulator 2419 → 1435 行、沙盒 378 案例回歸快照）
- [x] C 組：官方藍圖執行期生成（打包 1406 → 727 KB）、物品分類全面資料驅動、移除覆寫使用者資料之遷移碼、合併重複按鈕
- [x] 品質閘門：`npm run check` + pre-commit hook + GitHub Actions 部署前檢查（讓任何 AI 的修改自動受檢）
- [x] ★ 沙盒正交圓角走線 (零切穿方塊)、懸停發光流向動畫與 500ms 延遲焦點過濾實裝
- [x] ★ 產線計算機與沙盒模擬器邏輯全面統一、副產物拓撲直連、全廠 42 道食譜 100% 稼動率滿載與自癒機台清零達成
- [ ] 依遊戲推進持續登錄後半段新島嶼與高階配方
- [ ] 【冰塊 → 糊糊】糊糊未登錄（目前無食譜使用，使用者需要時自行登錄；`npm run check` 僅警告）

---

## 7. 近期決策摘要 (Recent Decisions)
> 完整原文見 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。新紀錄請先追加詳細內容至 CHANGELOG 頂端，再於此更新摘要（保留最近約 10 筆）。

* **2026-10-10｜核心超大檔案模組化拆分重構：抽離 sandboxDevicePhysics 與 byproductMatching，大幅釋放 solver 與 sandboxPhysics 維護空間**：
  - 物理與解算解耦：抽離 [`sandboxDevicePhysics.ts`](src/components/Sandbox/sandboxDevicePhysics.ts)（分流器與緩衝發酵物理，163 行）與 [`byproductMatching.ts`](src/services/byproductMatching.ts)（副產物折抵與二分圖槽位匹配，229 行）。
  - 維護餘裕大幅釋放：[`solver.ts`](src/services/solver.ts) 由 1536 行降至 **1389 行**（獲得 147 行餘裕）；[`sandboxPhysics.ts`](src/components/Sandbox/sandboxPhysics.ts) 由 798 行降至 **661 行**（獲得 139 行餘裕）。
  - 零回歸與守門員全量驗證：抽離模組不含任何硬編碼食材名稱，品質閘門（1008 solver / 378 sandbox 案例）100% 通過。

* **2026-10-10｜產線計算機與沙盒拓撲完全統一、全廠 42 道食譜 100% 滿載運轉、自癒機台清零與動態可達性防閉環機制實裝**：
  - 核心邏輯完全統一：沙盒藍圖生成（`dishBlueprintGenerator.ts`）完全由 `runParallelPlan` 與 `downstreamTargets` 拓撲驅動，拔除全廠自癒補丁機台（全 42 道食譜 `HealNodes = 0`），副產物過剩產能直連重構機 `in-base`。
  - 動態有向圖可達性防死鎖與遞移閉包 (`canAddDependency`, `recordDependency`)：在 `itemTraits.ts` 實裝可達性檢查與遞移閉包，徹底杜絕多重構產線間 cross-donation 導致的 8 階長震盪互鎖循環死鎖，【殺手薄餅】達成 100% 滿載線性級聯。
  - 裝箱演算法容量分流 (Best-Fit Decreasing)：在 `dishBlueprintGenerator.ts` 實裝 `partitionTargetsToSuppliers` 取代盲目模除，【咒語餃子】與【撒旦紅燴飯】躍升為 100.0% 滿載。
  - 熟成變質逆向溯源 (`spoilProduct` Reverse DAG)：`isUpstreamAncestor` 擴充熟成母物逆向追蹤，使中等熟成奶酪完整納入祖源防護。
  - 怪物庫克先生專線分流：依使用者確認將攪拌機拆為奶酪專線與奶油專線，與標準對齊。
  - 全量驗證：全廠 42 / 42 道食譜自動廚師機與解毒廚師機 100.0% 滿載，自癒機台 0 台，品質閘門全部通過。

* **2026-10-09｜全廠 42 道食譜 100% 滿載統一、連續流體 1:1 獨立專線直供、輸入端口需量校準消滅二次懲罰與配方週期精確匹配**：
  - 核心邏輯全面統一：消除產線計算機與沙盒模擬器之口徑歧異，全廠 42 / 42 道食譜自動廚師機稼動率全部達成 **100.0%**，內部所有機台 **100.0% 滿載**（零欠壓、零斷流）。
  - 連續流體 1:1 獨立專線直供 (`dishBlueprintGenerator.ts`)：徹底終結一對多混管平分稀釋（流體直供 `fIdx < fluidTargets.length`），超額流體由自癒機制配發專屬 1:1 攪拌機，【恐慌帕尼爾】稼動率由 50% 躍升為 100.0%！
  - 輸入端口需量校準消除二次懲罰 (`rateRequired`)：機台輸入端 `rateRequired` 精確校準為實際設計需量，徹底杜絕物理引擎空載額定值誤判欠壓。
  - 工序週期精準匹配 (`solver.ts` `getTargetCycle`)：去除動作動詞後優先完全匹配（防麵包搶配混和麵包麵團），【恐懼炸芝士】、【骨味炸米團】骨粉分流比例回歸 1:1 滿載。
  - 嚴格副產物 Donor 白名單 (`solver.ts`)：排除高階熟食品與消耗流體之工序，【殺手薄餅】物質操縱機 0% 斷流徹底修復。
  - 兩頁面對齊驗證：主產線生產機台數 35 / 42 道完全精確一致，7 道微小差異來自沙盒為貫徹連續流體 1:1 直供專線所額外配發之專屬攪拌機。

* **2026-10-09｜多階祖源死鎖修復 (isUpstreamAncestor)：有向圖 (DAG) 固體與流體遞迴追蹤，徹底杜絕「副產物捐給自己上游原料」之閉環死鎖**：
  - 核心缺陷診斷：原祖源保護只檢測 1 階直接原料，當中間產物（如蟑螂奶油）透過流體 (`蟑螂奶`) 間接依賴 2 階祖先（`泥沼蟑螂`）時漏抓，造成「重構泥沼蟑螂 ➔ 蟑螂奶 ➔ 蟑螂奶油 ➔ 捐贈給泥沼蟑螂」死鎖閉環，【怪物庫克先生】卡死在 0%。
  - 全面遞迴有向圖溯源 (`itemTraits.ts` `isUpstreamAncestor`)：遞迴追蹤所有 `inputs` 固體原料與 `fluidType` 流體原料，`solver.ts` 與 `parallelPlanner.ts` 全面杜絕逆向捐贈。
  - 效益與驗證：【怪物庫克先生】解除死鎖開始產出；品質閘門全數通過（solver 1008 / sandbox 378）。
* **2026-10-09｜沙盒分流器高度自適應排版 (消滅分流器壓到下方方塊) 與 42 道食譜專案全量比對稽核**：
  - 自適應行高與分流器防遮擋 (`dishBlueprintLayout.ts`)：自訂比例分流器卡片高度達 440px，實裝 `getNodeVisualHeight` 動態計算排高 `accumulatedY += maxRowH + 60`，【反胃辣芝士】分流器（鹽，Y=1580）與下方攪拌機（Y=2080）維持 60px 乾淨防重疊間隔，徹底消除壓到方塊問題；同步更新 `sandboxRouting.ts` 碰撞估算與升級快取 `20261009_v22`。
  - 42 道食譜計算機 vs 專案藍圖全量稽核：
    1. 計算機 vs 並聯規劃器：40/42 道 100% 相同；僅 2 道熾熱料理（反胃辣芝士、惡魔鷹身女妖）因自動配餐胃復慘合併底料而有機台數差異，符合物理規則設計。
    2. 並聯規劃器 vs 沙盒藍圖機台：42/42 道實體機台、底料機、廚師機 100% 精準吻合。
    3. 物理模擬稼動率診斷：34 道達成 100% 滿載，8 道有稼動率折減。查明演算法核心缺陷為「多階祖源死鎖」（單階原料檢查漏判間接祖先，如怪物庫克先生 0%），已定位修復方案。
* **2026-10-09｜反胃辣芝士接線規劃修復：原料採集設備排除副產物Donor、中間配方機台強一致性校準、塔瑪茄100%專供辛辣莎莎醬**：
  - 中間配方跨機台比對修復 (`solver.ts` `getProcessItemOutputRate`)：強制約束 `r.machine === machine`，徹底杜絕【收割機 (採收塔瑪茄)】意外跨機台匹配到【攪拌機 (塔瑪茄醬)】导致產率被虛假放大至 1.0/s。
  - 原物料自然開採機台排除副產物 Donor (`solver.ts` & `parallelPlanner.ts`)：在 `nonDonorMachines` 明確加入 `'收割機', '採掘機'`，原物料開採設備專供主產線，嚴禁分流折抵底料。
  - 塔瑪茄接線與稼動率 100% 滿載：【採收塔瑪茄】100% 直連【混和辛辣莎莎醬】，滿足 0.20/s 需求；辛辣莎莎醬穩定產出 0.40/s，同時滿足【攪拌致命莎莎醬】（0.20/s）與【重構巫妖骸骨】（0.20/s）；【自動廚師機 (反胃辣芝士)】與【攪拌致命莎莎醬】稼動率達 **100% 滿載**！品質閘門全數通過。
* **2026-10-09｜惡鬼千層麵三大問題解決：研磨骨粉流量標籤與產率物理修復 (0.20/s)、史萊姆肉餡產能精準折抵骸骨重構機 (省 1 收割機)、走線避障防壓方塊底角**：
  - 骨粉產率物理修復：移除 `dishBlueprintGenerator.ts` 虛假產率放大與 `rateRequired` 誤寫，研磨骨粉均分供給混和麵團與重構蜘蛛蛋，線上流量精確回歸 0.20/s 與 0.20/s，稼動率 100% 滿載。
  - 史萊姆肉餡過剩折抵與二分圖約束匹配 (`solver.ts`)：支援中間配方名稱包含模糊比對，精算絞碎史萊姆真實物理過剩流率為 0.20/s。透過 tier 層級評選以【重構綠色史萊姆】為起始啟動機，二分圖匹配將絞碎史萊姆分流直供【重構巫妖骸骨】底料端（省 1 底料收割機），研磨骨粉直供【重構蜘蛛蛋】底料端，全廠底料收割機由 3 台成功精減至 1 台！
  - 走線避障防壓方塊底角 (`sandboxRouting.ts`)：機台外框 `getNodeBounds` 上下安全裕度擴大至 12~16px、左右 12px；入端垂直引線安全槽位 `midX` 與 `x2` 離卡片左邊緣維持 $\ge 24\text{px}$ 安全間距，導角弧線在進入卡片前完全轉為水平直線，徹底消除走線切角壓入機台左下角圓角。
  - 抽離 `src/services/plantInfrastructure.ts` 集中管理基建，`solver.ts` 縮至 1550 行符合規範。全廠品質閘門全部通過。
* **2026-10-09｜沙盒產線最高效率接法實裝：純資料驅動並聯規劃、副產物折抵重構底料、固體可調比例分流器 (Splitter) 與全 42 道料理 100% 滿載驗證**：
  - 產線計算機最高效率接法 (`dishBlueprintGenerator.ts`)：實裝純資料驅動之並聯規劃與副產物折抵模式。主產線與熾熱配餐（胃復慘）統籌合併，相同原料/工序以最精省機台數生成。
  - 分流器中轉法則 (`dishBlueprintSplitter.ts`)：1:1 或 1:1:1 均等需量直接由機台輸出端口直連（0 分流器）；非對稱需量（如 4:1:1、5:2）插入可調比例分流器 (`type: 'splitter'`, `splitterMode: 'custom'`) 作為中轉。
  - 副產物折抵重構底料：過剩固體產能直連重構機 `in-base`（0.20/s，免合流器）；未折抵者由專屬底料收割機直連，重構機底料供給嚴格滿載 $\ge 0.20$/s，零空轉零汙泥。
  - 熾熱料理實測：【反胃辣芝士】共用重構泥沼蟑螂與開採鹽（各省 1 台），副產物折抵省 3 台底料機，機台數由 55 降至 49（淨省 6 台），主料理與胃復慘自動廚師機稼動率皆達 100% 滿載！【惡魔鷹身女妖】雙廚師機亦 100% 滿載！
  - 全廠 42 道料理品質驗證：42 / 42 道料理自動廚師機稼動率全部達成 **100.0% 滿載**！快取升級至 `20261009_v21_max_efficiency_consolidated_splitters`。
* **2026-10-09｜沙盒多管走線 X 軸間距放寬 (TRACK_GAP_X 20px 徹底終結重疊) 與固體汙泥線排除底部誤繞 (真物理內外分流)**：
  - 走線槽 X 軸軌道間距大幅放寬 (`sandboxRouting.ts`)：定義 `TRACK_GAP_X = 20px`，將原先只有 6px 的垂直軌道間距擴大 3.3 倍至 20px，徹底消除多條平行管線黏在一起像重疊的視覺壓迫感。
  - 嚴格流體虛空型別限定 (`SandboxConnectionsLayer.tsx`)：修正 `isVoid` 誤殺非流體物品之缺陷，固體【虛空汙泥】不再被賦予 `preferBelow: true`，回歸走兩機台間的中間走廊（$Y = 607.5$）；虛空自耗線走底部走廊（$Y = 885$），兩者在 X 軸相距 20px、Y 軸立體分離，達成 100% 零交叉零重疊。
  - 快取版本升級至 `20261009_v20_spacious_track_gap_20px`。
* **2026-10-09｜沙盒流體系統走線徹底重構：消滅超頻自耗閉環夾縫鑽線與機台捆綁回字框，實裝順向汙泥直供與下方外廊回流 (零交叉零重疊)**：
  - 流體基建階層排版優化 (`dishBlueprintLayout.ts`)：將物質操縱機移至第 1 欄池子正下方 $(60, curEnvY + 280)$，行距放寬至充足 60px。操縱機 ➔ 泵機的【汙泥回饋線】直接轉化為標準順向階梯線（$348 \to 440$ 由左至右），徹底消除逆流與夾縫鑽線。
  - 逆向走線引擎強化 (`sandboxRouting.ts`)：第 4 節支援 `preferBelow` 優先走下方外側通道；增加縫隙安全門檻（$< 40$px 判定過窄禁止切穿夾縫）。【虛空自耗線】沿右側下垂至底部通道橫穿再向上注入，汙泥在內上升 ($Y \le 815$)、虛空在下橫越 ($Y = 919$)，實現全場 100% 零交叉零重疊。
  - 快取版本升級至 `20261009_v19_clean_sludge_loop_conduits`。
* **2026-10-09｜三大區塊佈局實裝：全廠【左側液體系統】集中供液合併、【右上產線區域】主客並排與【下方電力系統】統一橫跨發電**：
  - 依手繪幾何圖實裝左側【液體系統】、右上【產線區域】與下方【電力系統】。全廠流體統籌抽取（需求 > 2.0 fl/s 自動升級超頻 8.0 fl/s 並建汙泥閉環），全廠電網統一平衡（2:1 平衡無孤島熔爐），徹底消除重複設施。快取升級至 `20261009_v18`。
* **2026-10-09｜重構底料智慧分配防偷料 (墳墓茄包廚師機稼動率 50% ➔ 100%) 與熾熱料理胃復慘電網獨立隔離/連線驅動排版實裝**：
  - 修正 `portUsedCapacity` 初始化與作物專屬底料分配，開採鹽 100% 直供廚師機，重構巫妖骸骨改由專屬日桂葉收割機供料，廚師機稼動率 100% 滿載。胃復慘採煤機與熔爐依真實連線拓撲水平直連，徹底消除交叉錯亂。
* **2026-10-09｜沙盒機台縱向間距放寬 (ROW_HEIGHT 360 / LANE_GAP 60 終結卡片重疊) 與機台行間縫隙直接走線 (消滅遠距繞道) 實裝**：
  - 機台縱向間距放寬 (`dishBlueprintLayout.ts`)：將主產線行高 `ROW_HEIGHT` 由 270px 調升至 360px、通道間距 `LANE_GAP` 由 40px 調升至 60px。全廠 42 套藍圖實體驗算：帶 3 輸入端口與警告標籤之機台（高度約 295~325px）卡片重疊數降為 0，每台機台垂直方向皆擁有至少 65px+ 的安全距離與清爽排版。
  - 行間縫隙直接走線 (`sandboxRouting.ts`)：避障管廊演算法升級，自動自中介欄位萃取相鄰機台間之「水平行間縫隙」（如 `採收辣椒 #1` 與 `烘烤灰燼 #3` 之間）並依位移代價最優選取。管線直接自最近的行間縫隙優雅平整穿過，消除所有冗餘折返，兼顧 100% 零切穿與最短路徑美學。
  - 藍圖快取自動升級：版本標記升級至 `20261009_v16_spacious_layout_and_inter_row_conduits`。
