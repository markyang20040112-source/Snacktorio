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
| `src/services/parallelPlanner.ts` | 多料理並聯純運算層（無 React）：`runParallelPlan`、`consolidatePlan` |
| `src/services/dataService.ts` | JSON 載入 / localStorage 快取 / 匯出 |
| `src/services/githubSync.ts` | Git Data API 單一原子 Commit 同步 5 份資料檔 + 沙盒藍圖庫（只推送自訂/修改過的藍圖；本機無藍圖時不推送該檔；無變更則略過） |
| `src/services/dishBlueprintGenerator.ts` | `buildDishBlueprint`：由資料庫自動推導任一食譜之完整沙盒產線（新食譜自動適配） |
| `src/services/builtInBlueprints.ts` | 官方料理藍圖執行期生成（依 `dataService.getRevision()` 快取）＋同步時剔除可重建藍圖 |
| `src/services/sandboxBlueprintService.ts` | 沙盒專案庫存取（官方藍圖與本機自訂專案合併、刪除/恢復/匯入匯出） |
| `src/components/ParallelPlanner/` | `ParallelPlanner.tsx`（控制台）+ `FluidStation` / `PowerStation` / `ProcessTable` / `KpiSummary` 顯示元件 |
| `src/components/Sandbox/` | `SandboxSimulator.tsx`（畫布狀態與互動）、`sandboxPhysics.ts`（物理引擎）、`sandboxNodeUtils.ts`（`makeNode` 節點工廠、校準、子圖複製、存檔）、`SandboxNode.tsx`、`SandboxBlueprintModal.tsx`（專案庫）、顯示元件 `SandboxCatalogSidebar` / `SandboxMetricsPanel` / `SandboxToolbar` / `SandboxConnectionsLayer`、`sandboxTypes.ts` |
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
- [ ] 依遊戲推進持續登錄後半段新島嶼與高階配方
- [ ] 【冰塊 → 糊糊】糊糊未登錄（目前無食譜使用，使用者需要時自行登錄；`npm run check` 僅警告）

---

## 7. 近期決策摘要 (Recent Decisions)
> 完整原文見 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。新紀錄請先追加詳細內容至 CHANGELOG 頂端，再於此更新摘要（保留最近約 10 筆）。

* **2026-10-07｜官方沙盒料理藍圖修復與模組化重構（修正停機、端口速率動態化、炙熱胃復慘模組）**：
  - 修復【反胃辣芝士】與【惡魔鷹身女妖】因注入機流量上限與分流判定導致之斷流與廚師機停機（放寬注入機額定上限、修正 `canServe` 與直供流量計算，經物理引擎驗證全 42 套藍圖停機機台數為 0，100% 滿載）。
  - 中間機台輸入端口需求速率改為配方基準（`inp.count / cycleTime`，如混合機 0.25/s），與左側目錄拖曳出的機台端口完全一致。
  - 具熾熱/炙熱屬性之料理自動在藍圖右側串接完整【胃復慘】中和解毒產線。
  - 拆分 `src/services/dishBlueprintPower.ts`，主檔行數 842 → 627 行（符合 < 800 行上限）；消滅硬編碼物品名稱，底料作物與中和食譜由資料屬性動態推導；`npm run check` 與 `npm run build` 100% 通過。
* **2026-10-06｜品質閘門（四層防護）**：新增 `npm run check`（tsc + 資料 lint + 程式守門 + 回歸指紋）、`npm run baseline`、`.githooks/pre-commit`、CI 部署前檢查與「基準檔變更須 `BASELINE:` 說明」規則；`AGENTS.md` 新增第 6 節強制流程與寫程式慣例。既有問題以「只能縮減」的基準檔容忍，新問題一律擋下。網頁工作台同步的資料變更不會被擋（回歸比對自動暫停並提示）。
* **2026-10-06｜資料更名與清理（使用者核准）**：【致命沙沙醬】→【致命莎莎醬】、【辛辣沙沙醬】→【辛辣莎莎醬】、【刺波羅樹】→【刺菠蘿樹】（統一草字頭）；【沙塊】去重並改為採掘機產出（同鐵礦石）；`熔爐.png` 改名 `虛空熔爐.png`；itemIcons 刪除失效別名，保留 5 個工序找圖示用別名（`baseline.json` 的 `iconAliases`）。計算結果除名稱外完全一致（1008 / 378 IDENTICAL）。品質閘門新增「同音 / 形近字」錯字偵測（沙/莎、波/菠、羅/蘿…）。⚠ 瀏覽器工作台需先「重置 / 載入官方資料」再同步，否則舊名稱會被推回。
* **2026-10-06｜C 組（使用者核准）**：官方料理藍圖改為執行期生成（`sandboxBlueprints.json` 1.1 MB → `[]`，與舊檔 42/42 逐位元組一致，打包 −48%，同步只推送自訂/修改專案）；流體、原料機台、發酵卡改由資料欄位推導（新舊結果逐項比對：流體 13/13 相同、原料僅【沙塊】改正為採掘機、發酵卡 +冰塊 +蟑螂酸奶），未修改 `items.json`；移除每次載入強制覆寫炙烈紅油/醋產量；移除重複「同步 GIT」按鈕。1008 + 378 案例 IDENTICAL。
* **2026-10-06｜沙盒瘦身第二輪（零功能變更）+ 3 項修正**：SandboxSimulator 2419 → 1435 行（抽出 `sandboxNodeUtils` 與 4 個顯示元件）、sandboxPhysics 938 → 797、dishBlueprintGenerator 880 → 787、批次腳本 860 → 47；新增沙盒 378 案例快照，solver 1008 + 沙盒 378 全 `IDENTICAL`，重新產生藍圖與現有資料逐位元組一致；刪除 `requirements.txt`。修正：GitHub 同步不再以 `[]` 覆蓋藍圖庫、拖曳不再每幀重算物理與存檔、提示訊息計時器不再互相覆蓋。
* **2026-10-06**：日桂葉產能異常與虛假倍率根除、廚師機產能切換斷線修復、專案庫新增空白專案與區域框選局部複製貼上（排查並根除 42 套藍圖中 186 台設備虛假產能倍率，全面改為實體 1:1 分離獨立機台直供，42 套藍圖 100% 滿載且 0 虛假產能驗證；修復廚師機 24 ➔ 12 切換端口斷線；專案庫實裝「➕ 新增空白專案」；實裝 Shift+拖曳區域框選、多選整組移動與 Ctrl+C/Ctrl+V 局部複製貼上拓撲）。
* **2026-10-06**：官方專案標籤修復、跨頁面/畫布產線複製貼上與追加、以及未來新食譜自動生成產線專案系統（校準官方食譜/教學/自訂專案識別邏輯與分類 Tab 篩選；專案庫支援「➕ 追加至畫布」自動計算邊界平移拼裝產線不覆寫既有機台；實裝 Ctrl+C/Ctrl+V 剪貼簿複製貼上機台拓撲；封裝前端原生 `buildDishBlueprint`，未來在資料工作台每登錄一筆新食譜，沙盒專案庫全自動即時推導並出現該食譜之完整自動化產線）。
* **2026-10-06**：全遊戲 42 道食譜專案藍圖庫批次建置與 localStorage 自動合併機制修復（為全遊戲 42 道食譜自動推導並建置專案藍圖庫；實裝 `getAllBlueprints` 自動將全新官方藍圖動態合併至瀏覽器本地專案庫，徹底修復先前因已有本機存檔導致看不到新藍圖問題；專案庫新增「🔄 載入官方食譜」快捷按鈕與官方/自訂分類標籤）。
* **2026-10-06**：沙盒輸入端嚴格認物品機制與分流器混流污染防禦系統（物理引擎全機台/廚師機/發酵/熔爐嚴格比對進料物料名稱，錯誤連入一律停機並標記 `❌ 錯誤連入原料/流體：X（需求：Y）`；分流器混流污染檢測 `❌ 物料混流污染（嚴禁混流，設備停機）`；前端拉線雙向防呆，目標端口物料不符或分流器/泵機上下游衝突時立即攔截提示）。
* **2026-10-06**：分流器輸入端動態流量適應與多產線專案庫/GIT雲端同步系統（分流器輸入端口隨進料自動綁定名稱與實時流量如 `塔瑪茄 0.40/s`；沙盒支援無限套產線專案命名儲存、Ctrl+S 快速覆寫、複製副本、重新命名、JSON匯入匯出與 GitHub API 一鍵雲端同步跨裝置漫遊）。
* **2026-10-06**：沙盒物品分流器升級為「輸出比例權重」模式與高精度平衡（徹底解決 1/3, 2/3, 1/6, 3:2, 2:1 等除不盡循環小數之精度痛點；支援比例預設快捷鍵、各路百分比與實際流率即時反饋、進料變動自適應等比縮放、4 位高精度計算與 $0.005$ 容差防禦）。
