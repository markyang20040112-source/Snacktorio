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

* **Python（選用）**：`.venv` 僅供 `scripts/github_push.py` 與早期 Excel/Word 解析（已退役）；**Web 應用只需要 Node.js**。

---

## 3. 程式架構地圖 (Architecture Map)
| 路徑 | 職責 |
|---|---|
| `src/services/solver.ts` | 核心解算引擎：配方樹展開、`calculateSingleDish`、`sizeAutonomousPump`、`settlePlantInfrastructure`（泵機階梯 + 虛空閉環 + 電網，單一實作供單料理與並聯共用） |
| `src/services/parallelPlanner.ts` | 多料理並聯純運算層（無 React）：`runParallelPlan`、`consolidatePlan` |
| `src/services/dataService.ts` | JSON 載入 / localStorage 快取 / 匯出 |
| `src/services/githubSync.ts` | Git Data API 單一原子 Commit 同步 5 份資料檔（無變更則略過） |
| `src/components/ParallelPlanner/` | `ParallelPlanner.tsx`（控制台）+ `FluidStation` / `PowerStation` / `ProcessTable` / `KpiSummary` 顯示元件 |
| `src/components/Sandbox/` | `SandboxSimulator.tsx`、`SandboxNode.tsx`、`sandboxPhysics.ts`、`sandboxTypes.ts` |
| `src/components/DataManager/` | 資料工作台各管理分頁與同步設定 |
| `src/utils/actionVerbs.ts` | 工序動作動詞共用正則（solver 與 iconHelper 共用） |
| `src/utils/` 其他 | `math.ts`（GCD/精度）、`iconHelper.ts`、`imageBeautifier.ts`、`machineBadge.ts` |
| `scripts/regression/` | 黃金快照回歸測試（1008 案例，重構前後比對） |
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
10. **沙盒物理**：欠壓週期稀釋（週期等比拉長，不重複懲罰）、汙泥連線即超頻（供泥不足等比降載 sludgeSat = sludgeRate / 0.20）、注入機→抽取泵機原位規則、虛空汙泥空載凝結免底料、停機設備零產出強約束、四階段 DAG 拓撲結算；原料分類純由 `items.json` 的 `source` 判定。
11. **資料權威性**：`calculatorDb.json` 為工序/流體需量權威來源，配方樹生成器僅作後備（實測移除後 42 道中 35 道結果改變，不可刪）。
12. **浮點精度**：1/3、1/6、1/11、2/11 等循環小數以精準浮點 + GCD 處理。

---

## 5. 開發與交接流程 (Dev Workflow)
* **環境**：Node.js 22（建議）→ `npm install` → `npm run dev`（開發）/ `npm run build`（建置）。
* **型別檢查**：`npx tsc --noEmit`（需 0 錯誤）。
* **回歸測試**（任何 solver / planner 重構前後必跑）：
  1. 重構前：`npx tsx scripts/regression/snapshot.ts before.snapshot.json`
  2. 重構後：`npx tsx scripts/regression/snapshot.ts after.snapshot.json`
  3. 比對：`node scripts/regression/compare.mjs before.snapshot.json after.snapshot.json` → 須為 `IDENTICAL`
  （`*.snapshot.json` 已列入 `.gitignore`）
* **跨裝置轉移**：`git clone` / `git pull` → `npm install` → `npm run dev`。
  > ⚠️ 只存在瀏覽器 localStorage 的編輯不會跟著 Git 走，須先在工作台「GitHub 同步」推上去，或匯出 JSON 後提交。
* **Python（選用）**：`python -m venv .venv; .venv\Scripts\pip install -r requirements.txt`。

---

## 6. 開發進度 (Roadmap)
- [x] Markdown 知識庫（`docs/`）、Excel/Word 全面退役，100% 純文字 JSON 驅動
- [x] React + Vite Web 應用：產線計算機、多料理並聯規劃、資料工作台、★ 自由沙盒模擬器
- [x] GitHub API 雲端同步與 GitHub Pages 自動部署
- [x] 程式瘦身重構（並聯規劃拆分、基建結算單一化、黃金快照回歸測試）
- [ ] 依遊戲推進持續登錄後半段新島嶼與高階配方
- [x] 沙盒 `isFluidItem` 名稱後綴推測改為資料庫驅動判定（13 種真實流體白名單、156 項物品校準）

---

## 7. 近期決策摘要 (Recent Decisions)
> 完整原文見 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。新紀錄請先追加詳細內容至 CHANGELOG 頂端，再於此更新摘要（保留最近約 10 筆）。

* **2026-10-06**：基礎材料收集矛盾徹底修復與地圖虛擬方塊清理（移除 `intermediateRecipes.json` 5 筆採收偽配方與 `items.json` 14 項地圖地塊虛擬物品；「自然採集」確立為單一事實來源，全廠 1008 測試案例 0 KPI 差異）。
* **2026-10-06**：沙盒拓撲動態自適應收斂演算重構（廢除死板 10 輪常數，改為動態偵測全廠流率與稼動率收斂差量；簡單拓撲提早中斷，深層長拓撲依全廠規模自適應延伸深度，未來任何極限配方永不匱乏）。
* **2026-10-06**：沙盒拉線邊緣自動推鏡頭、滑鼠中/右鍵隨時平移與雙向拉線（支援從輸入端直接拉線至來源輸出端，解決長距離設備需反覆手動縮放與來回奔波之痛點）。
* **2026-10-06**：沙盒全廠流體產銷指標支援中間加工機台產出追蹤（修復攪拌機產出蟑螂奶等自製連續流體未計入右側 produced 指標導致顯示 0.0/1.5 需的問題）。
* **2026-10-06**：沙盒深層鏈路 10 輪迭代收斂與全機台狀態最終強制刷新（修復連線標籤已達 1.00 fl/s 但深層下游廚師機因迭代輪數不足停留在 67% 假性欠壓時序延遲問題）。
* **2026-10-06**：固體物品與連續管網流體全面資料庫校準與沙盒判定重構（修復蟑螂奶油、蟑螂黃油、酸奶油、辛辣沙沙醬等被誤判為流體問題；全資料庫 156 項物品校準、舊存檔讀取自動校準端口型別）。
* **2026-10-06**：自由沙盒實裝「物品分流器」（支援 1進2出 / 1進3出 切換、均等分流與各輸出埠自訂流量約束、進料超額等比降載）與「發酵變質 / 輸送緩衝方塊」（時序發酵推進與建議傳送帶格數標記）。
* **2026-10-06**：泵機虛空汙泥超頻等比例降載與全系統供料物理守恆全面審查（實裝超頻需量 0.20/s 嚴格物料守恆；供泥 0.10/s 等比降載至 50% 稼動率 / 4.0 fl/s；注入機與全機台精確缺料提示）。
* **2026-10-06**：停機設備零產出強約束與連線流量收斂最終結算（修復缺少原料/流體停機時輸出端仍給出流率導致下游泵機假性超頻問題）。
* **2026-10-03｜程式瘦身重構（零功能變更）**：
  - `ParallelPlanner.tsx` 1640 → 289 行：運算抽至 `services/parallelPlanner.ts`，顯示拆為 4 個子元件。
  - `solver.ts` 三處重複的泵機/虛空/電網結算合併為 `settlePlantInfrastructure`；刪除無呼叫者的 `combineCalculationResults`。
  - 動作動詞正則統一至 `utils/actionVerbs.ts`；沙盒原料分類改純用 `items.json` 的 `source`（名稱清單經驗證完全冗餘）。
  - GitHub 同步改為單一原子 Commit；`.gitignore` 清理；新增 `scripts/regression/` 黃金快照。
  - 全程以 1008 案例快照驗證結果逐字相同（IDENTICAL）。
  - 保留未改：`calculatorDb.json`（非冗餘）；沙盒 `isFluidItem` 名稱推測與資料不符 5 例（虛空汙泥、蟑螂奶油、蟑螂黃油、辛辣沙沙醬、撕裂脆片蘸醬），修正會改變行為，待使用者核准。
* **2026-10-03**：沙盒注入機原位環境池流率修復、汙泥連線即超頻與產率雙重懲罰修正。
* **2026-10-03**：攪拌機流體端口類型修正、泵機吃汙泥自動超頻與注入機原位抽取流向規範。
* **2026-10-03**：Excel 試算表正式退役刪除，純文字 Web 輕量化架構確立。
* **2026-10-03**：物質操縱機「虛空汙泥空載凝結免底料」落實與終端料理圖示清理。
* **2026-10-03**：沙盒虛空熔爐固體燃料拓撲穿透修復與基礎原料庫重構。
* **2026-10-03**：★ 自由沙盒模擬器實裝（欠壓週期稀釋引擎、全自主拓撲）。
* **2026-10-02**：並聯規劃注入機全廠單一環境池整併與抽取泵機流體合併。
* **2026-10-01**：注入機環境原位轉化法則實裝與衍生流體外採解耦。
* **2026-10-01**：反胃辣芝士採收辣椒台數校正（6→2）與注入機快取同步修復。
