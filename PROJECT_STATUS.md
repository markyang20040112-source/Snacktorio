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
| `src/services/digitalTwinAudit.ts` | 數位雙生閉環驗證引擎：第一關靜態鏡像審計 (`runMirrorAudit`) + 第二關動態物理 60 週期快進 (`runHeadlessPhysicsAudit`) + 全廠 42 道料理大體檢 (`runFullPlantAudit`) |
| `src/services/parallelPlanner.ts` | 多料理並聯純運算層（無 React）：`runParallelPlan`、`consolidatePlan` |
| `src/services/dataService.ts` | JSON 載入 / localStorage 快取 / 匯出 |
| `src/services/githubSync.ts` | Git Data API 單一原子 Commit 同步 5 份資料檔 + 沙盒藍圖庫（只推送自訂/修改過的藍圖；本機無藍圖時不推送該檔；無變更則略過） |
| `src/services/dishBlueprintGenerator.ts` | `buildDishBlueprint`：由資料庫自動推導任一食譜之完整沙盒產線（新食譜自動適配，0 底料需求自動略過孤島收割機） |
| `src/services/builtInBlueprints.ts` | 官方料理藍圖執行期生成（依 `dataService.getRevision()` 快取）＋同步時剔除可重建藍圖 |
| `src/services/sandboxBlueprintService.ts` | 沙盒專案庫存取（官方藍圖與本機自訂專案合併、刪除/恢復/匯入匯出） |
| `src/components/ParallelPlanner/` | `ParallelPlanner.tsx`（控制台）+ `FluidStation` / `PowerStation` / `ProcessTable` / `KpiSummary` 顯示元件 |
| `src/components/Sandbox/` | `SandboxSimulator.tsx`（畫布狀態與互動）、`DigitalTwinModal.tsx`（數位雙生體檢診斷卡）、`sandboxPhysics.ts`（物理引擎）、`useSandboxAutoPan.ts`（邊緣自動推鏡頭）、`sandboxDevicePhysics.ts`（分流器與緩衝發酵物理）、`sandboxNodeUtils.ts`（`makeNode` 節點工廠、校準、子圖複製、存檔）、`SandboxNode.tsx`、`SandboxBlueprintModal.tsx`（專案庫）、顯示元件 `SandboxCatalogSidebar` / `SandboxMetricsPanel` / `SandboxToolbar` / `SandboxConnectionsLayer`、`sandboxTypes.ts` |
| `src/components/DataManager/` | 資料工作台各管理分頁與同步設定 |
| `src/utils/itemTraits.ts` | 物品特性資料驅動判定：流體（食譜 `fluidType` 引用推導）、原料機台（`source`）、可發酵物品（`isPerishable`） |
| `src/utils/actionVerbs.ts` | 工序動作動詞共用正則（solver 與 iconHelper 共用） |
| `src/utils/` 其他 | `machineSpec.ts`（從 `machines.json` 讀取耗電與哥布林）、`math.ts`（GCD/精度）、`iconHelper.ts`、`imageBeautifier.ts`、`machineBadge.ts` |
| `scripts/regression/` | 黃金快照回歸測試：`cases.ts`（案例定義，solver 1008 + 沙盒 378）、`snapshot.ts` / `sandboxSnapshot.ts`（輸出完整快照）、`compare.mjs` |
| `scripts/check/` | 品質閘門 `npm run check`：`index.ts`（資料 lint + 程式守門 + 回歸指紋）、`fingerprints.json`（每案例雜湊 + 資料雜湊）、`baseline.json`（佔位名、既有資料問題、已審核相似名、大檔行數、既有硬編碼名稱；只能縮減）、`installHooks.mjs`；hook 在 `.githooks/pre-commit` |
| `scripts/generateAllDishBlueprints.ts` | 以 `buildDishBlueprint` 生成全部料理藍圖並逐道回報缺料（預設只檢查，不寫入資料檔） |
| `docs/` | 知識庫（README、01 物理、02 公式、03 登錄 SOP、04 診斷手冊、CHANGELOG 決策日誌） |

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
- [x] ★ D 組：沙盒與計算機基建（泵機台數、總耗電、發電熔爐 2:1:1、哥布林數）42 道料理 100% 對齊、全機台數值由 `machines.json` 驅動、數位雙生第一關三項基建對帳實裝
- [ ] 依遊戲推進持續登錄後半段新島嶼與高階配方
- [ ] 【冰塊 → 糊糊】糊糊未登錄（目前無食譜使用，使用者需要時自行登錄；`npm run check` 僅警告）

---

## 7. 近期決策摘要 (Recent Decisions)
> 完整原文見 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。新紀錄請先追加詳細內容至 CHANGELOG 頂端，再於此更新摘要（保留最近約 10 筆）。

* **2026-10-17｜D 組 Step 4（D8 + solver 流體修正）**：`digitalTwinAudit.ts` 第一關補入總耗電、泵機台數、發電熔爐數對帳；`solver.ts` 排除固體「水稻」誤判為水，並依 `intermediateRecipes.fluidType` 排除「炸哈瓦那魔椒」誤算入普通油。全廠 42 道料理在計算機與沙盒 100% 對齊（42/42 Healthy）。
* **2026-10-17｜D 組 Step 3（D4 + D6）**：新增 `machineSpec.ts` 統一由 `machines.json` 讀取耗電與哥布林（修正轉化抽取泵哥布林 0➔1）；沙盒發電模組改用計算機超頻 2:1:1 配置（16 FV/s 熔爐 + 採煤機 + 供汙泥操縱機），42 道料理熔爐數與計算機完全一致。
* **2026-10-17｜D 組 Step 2（D1 + D2 + D3）**：`dishBlueprintPower.ts` 改用 `sizeAutonomousPump` / `sizeVoidPump` 配置泵機階梯，供汙泥操縱機改讀 `machines.json`（1 FV / 1 隻）；`sandboxPhysics.ts` 超頻泵維持 1 FV / 1 隻。11 道超頻泵料理負載與哥布林回歸正確值，計算機 1008 案例不變。
* **2026-10-17｜D 組 Step 1（D5 + D7）**：`dishBlueprintGenerator.ts` 泵機 `machineName` 改從 `machines.json` 讀取為 `'虛空泵機'`；`dishBlueprintLayout.ts` 環境泵分類加入 `n.type === 'pump'`（排除 `pump-trans-`）。計算機 1008 案例完全不變。
* **2026-10-17｜程式清理 A/B/C（零計算變更）**：刪除約 250 行死碼、底料名稱判斷集中至 `itemTraits.ts`、沙盒連線走線快取（拖曳不再每幀重算）、數位雙生不再重複計算。淨 −181 行，指紋全數一致。
* **2026-10-17｜名稱寫法全面統一**：莎莎、菠蘿、混合、熾熱、麵團、豆蔻、姜（奶酪／芝士保留）；資料、圖檔、程式同步，移除所有異體字轉換。計算僅骨味炸米團折抵對象改變（總量不變）。⚠ 瀏覽器工作台需先按 ↺ 重置再同步。
* **2026-10-17｜恢復嚴格品質閘門**：撤銷 CI 自動重建基準（會讓回歸保護失效），閘門新增自我保護，AGENTS.md 新增「嚴禁削弱品質閘門」。
* **2026-10-13｜莎莎醬工序圖標解析修復**：廢除 `iconHelper.ts` 殘留的 `replace(/莎莎/g, '沙沙')`，統一以草字頭「莎」為單一事實來源並補齊直通別名。
* **2026-10-13｜數位雙生閉環檢查機制 (Digital Twin Verification) 實裝**：實裝第一關靜態鏡像審計 (`runMirrorAudit`)、第二關 60 週期無 UI 物理快進 (`runHeadlessPhysicsAudit`) 與全廠 42 道大體檢 (`runFullPlantAudit`)；0 底料需求不再生成孤島收割機；新增診斷卡彈窗與工具列狀態徽章。
* **2026-10-13｜多料理並聯規劃雙槽底料折抵全面打通**：抽離 `solveBipartiteByproductMatching`，單料理與多料理並聯 100% 共用二分圖背包演算法，支援跨產線碎屑（$\ge 0.049$/s）湊滿 0.20/s。

* **2026-10-10｜核心超大檔案模組化拆分重構**：抽離 `sandboxDevicePhysics.ts` 與 `byproductMatching.ts`，大幅縮減 `solver.ts` 與 `sandboxPhysics.ts` 行數。

