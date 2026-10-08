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
- [x] ★ 沙盒正交圓角走線 (零切穿方塊)、懸停發光流向動畫與 500ms 延遲焦點過濾實裝
- [ ] 依遊戲推進持續登錄後半段新島嶼與高階配方
- [ ] 【冰塊 → 糊糊】糊糊未登錄（目前無食譜使用，使用者需要時自行登錄；`npm run check` 僅警告）

---

## 7. 近期決策摘要 (Recent Decisions)
> 完整原文見 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。新紀錄請先追加詳細內容至 CHANGELOG 頂端，再於此更新摘要（保留最近約 10 筆）。

* **2026-10-09｜智慧正交圓角走線 (零切穿方塊)、懸停發光流向動畫與 500ms 延遲焦點過濾實裝**：
  - 正交圓角走線 (`sandboxRouting.ts`，方案 A)：線路自輸出端出線向右進入 92px 走線槽 (Gutter)，於行間 40px 通道 (Gap) 橫向穿行，轉角配置 10~14px 平滑二次貝茲圓弧倒角 (Q 曲線)。徹底終結同欄上下直供（如骨粉供蜘蛛蛋）斜穿方塊腹部之問題，100% 零穿透，展現工廠輸送帶秩序美學。
  - 連線與兩端機台聯動發光：懸停連線即時增粗並點亮微光（固體翠晶綠 #34d399、流體霓虹青 #38bdf8），兩端機台邊框亮起綠色（供料端）與青色（接收端）霓虹光圈與身分標籤；線上虛線實裝 0.8s 循環流向粒子動畫，直覺辨識傳輸方向。
  - 500ms 停留延遲焦點過濾 (`useSandboxHover.ts`)：游標停留於連線上滿 500ms 自動啟動焦點過濾，全廠無關機台與管線淡化至 20%~25% 透明度，移開立即還原；機台反向關聯懸停同步套用 500ms 延遲，徹底消除滑鼠快速移動閃爍。
* **2026-10-08｜泵機系統左側側欄佈局與電力系統橫向並排 (釋放 Y 軸壓力) 幾何引擎重構**：
  - 泵機系統（左側縱向側欄 / 後端補給區）：環境抽水、抽油、抽虛空系統完整移至工廠最左側（$X = \text{originX}$），形成專屬後端補給側欄（固定寬度 2 欄 760px）。流體管線自左向右自然平順接入主產線與右側胃復慘模組，主產線下方空間完全解放。
  - 電力系統（右下側橫向並排模組，Y 軸高度大減 65%~80%）：將「1 採煤機 : 2 虛空熔爐」定義為標準獨立發電單元（Power Cell）。單元內部採煤機置於左側垂直中央，就近直連相鄰上下兩台熔爐；所有發電單元沿 X 軸在產線正下方橫向並排展開（依產線寬度自適應折行）。
  - 效果：電力系統總垂直高度由原先 1500~3000px 巨幅收斂至 **490px**，供煤連線縮至極短水平線，徹底消滅大斜率長線。快取版本升級至 `20261008_v15_left_pump_sidebar_and_parallel_power`。
* **2026-10-08｜食譜必要製程優先分級、產能回補不干擾 X 軸層級與方塊 100% 零重疊垂直間距校準**：
  - 食譜必要製程優先分級：將連向任意物品/重構底料 (`in-base`) 之彈性回補連線從逆向層級推導中剔除，設備層級完全由「食譜必要原料輸出」決定。在【惡鬼千層面】中，`研磨骨粉`（x=880, y=80）與 `重構蜘蛛蛋`（x=880, y=350）成功並列於同一 X 坐標，骨粉直供麵團同時垂直向下自回補蜘蛛蛋，消滅空列。
  - 方塊 100% 零重疊垂直間距校準：考慮機台警告標籤與多輸入端高度可達 250~265px，主產線列距定為 270px、LANE_GAP 定為 40px；環境流體池、採煤機與虛空熔爐縱向間距定為 245px（徹底消除熔爐 200px 重疊）。42 套藍圖 100% 零重疊。快取版本升級至 `20261008_v14_primary_recipe_tier_and_no_overlap`。
* **2026-10-08｜逆向距離 X 軸分級演算法 (ALAP / Distance to Final Assembly Layout) 實裝**：
  - 逆向加工距離分級：改由設備距離終端組合機台（自動廚師機）的逆向加工跳數推導層級（$Tier = MaxDistance - DistanceFromChef$）。
  - 直供廚師機機台右移對齊：如【鮮紅濃湯】中直接供給廚師機之收割機（日桂葉 #1）、開採機（豆肉蔻、鹽）以及攪拌機距離皆為 1，全部自動對齊於 Tier 1（緊鄰廚師機）；需要二次加工之原料（採收塔瑪茄、日桂葉 #2）推至 Tier 0，消除跨欄長距輸送帶，產線佈局更為緊湊俐落。
  - 多去向防回溯保證：若設備產出有多個去向，逆向距離恆取最大值 $+ 1$，確保所有連線嚴格自左向右流動。全 42 套藍圖回溯數 0、碰撞數 0。快取版本升級至 `20261008_v13_reverse_distance_tier_layout`。
* **2026-10-08｜緊湊垂直間距優化、滾輪微縮解鎖至 10% 與全景適應 (Fit to View) 一鍵導覽實裝**：
  - 垂直間距緊湊化：主產線列距調降至 225px、LANE_GAP 調降至 30px、環境/電網垂直間隔壓縮，全產線垂直跨度減少近 30%，視覺緊湊和諧且 100% 保持零重疊。
  - 縮放極限全面鬆綁：滾輪最小縮放比例由 40% (0.4) 鬆綁至 10% (0.1)，超大產線亦能輕鬆微縮盡收眼底。
  - 實裝「全景適應 (Fit to View)」：左下角工具列新增 Maximize 全景按鈕，可一鍵依當前瀏覽器視窗尺寸自動計算全廠外接矩形並置中縮放；官方藍圖載入時亦全自動計算合適視角呈現完整產線。快取版本升級至 `20261008_v12_compact_spacing_and_fit_view`。
* **2026-10-08｜三大幾何排版鐵律實裝：加工層級決定 X 軸、輸入端口決定 Y 軸通道 (Port-Lanes) 與全廠 100% 零碰撞佈局引擎**：
  - 加工層級決定 X 軸：無製程原料機為 Tier 0（最左側 $X_0$），下游每經一道加工階層遞增 1（$X = X_0 + \text{tier} \times 380$px），終端自動廚師機位於最右側欄位，管線嚴格自左向右平順輸送，杜絕回溯。
  - 機器輸入端口決定 Y 軸通道 (Port-Lanes)：終端廚師機之每個輸入端口（Port 0, Port 1, ...）定義專屬獨立橫向帶狀通道，上游所有機台依 DFS 遞迴樹狀排序對齊子端口，各通道平行直連對應端口，徹底根除交叉纏繞。
  - 100% 零重疊保障：主產線欄寬 380px、列距 270px；環境流體配置於主產線下方獨立區塊；電網雙欄排列於流體下方；胃復慘模組獨立右移。全 42 道食譜實測碰撞數由 180+ 處降為 0。
  - 抽離 `src/services/dishBlueprintLayout.ts`，主檔 728 行符合規範，快取版本升級至 `20261008_v11_hierarchical_port_lanes_no_collision`。
* **2026-10-08｜真物理流量盈餘推導（Flow-Based Surplus）、徹底根除關鍵字過濾與最鄰近底料匹配（自適應未來所有食譜）**：
  - 徹底移除字串黑白名單，貫徹純資料驅動：結合解算引擎 `getProcessRealSurplusRate` 精確遞迴計算上游原料瓶頸（Feasible Rate），扣除主流程需量，唯有真實物理盈餘 $\ge 0.19$ 且端口有餘額時方可供料。
  - 工序盈餘扣減追蹤：引入 `procSurplusUsed`，donor 盈餘被消費後立即扣減，徹底杜絕一物多借之超抽缺料。
  - 最鄰近幾何拓撲直供（Nearest Proximity Matching）：【惡鬼千層麵】研磨骨粉多出的 0.20/s 盈餘精準就近直連【重構蜘蛛蛋】，雙方 100% 稼動率滿載，省下收割機；【惡魔鷹身女妖】辛辣莎莎醬真實物理盈餘精算為 0.00/s，100% 專供致命莎莎醬，絕無倒灌。
  - 烤箱做灰燼等需要任意物品之機台統一納管，升級快取版本至 `20261008_v10_flow_surplus_and_nearest_alloc`。
* **2026-10-08｜智慧底料分配器嚴格副產物白名單、排斥流體消耗機台與消滅莎莎醬倒灌**：
  - 診斷莎莎醬被誤判為底料之病因：先前演算法僅以 `surplus > 0.05` 寬鬆篩選，導致混合機消耗紅油之高階醬料【辛辣莎莎醬】被誤當作多餘底料，造成紅油消耗暴增與致命莎莎醬斷流。
  - 實裝 6 大黃金約束法則：嚴禁消耗流體之機台、嚴格排除醬料/熟食/麵糰等精緻品、限定副產物白名單（骨粉/碎屑），無副產物產線（如惡魔鷹身女妖）嚴格回歸由日桂葉收割機乾淨供料。升級快取版本至 `20261008_v9_strict_byproduct_only`。
* **2026-10-08｜智慧底料分配器嚴格排除自動廚師機輸出與有向圖死鎖防禦**：
  - 徹底排除自動廚師機：終端出餐料理（如千層麵）絕不可連線回物質操縱機當作原料底料，徹底杜絕成品倒灌。
  - 引入 `hasDirectedPath` 有向無環圖檢查：嚴禁將下游產物反向供應該操縱機之底料（如骨粉不可連回骸骨），徹底消除死鎖閉環，多餘產能僅安全配給平行獨立分支（如骨粉供蜘蛛蛋）。升級快取版本至 `20261008_v8_no_chef_output_donor`。
* **2026-10-08｜超頻泵機自耗閉環、產線富餘物料直供重構底料（消滅冗餘收割機）與電網淨盈餘防禦**：
  - 超頻虛空泵落實淨 7.0 fl/s 自耗閉環：由超頻虛空泵直接分流 1.0 fl/s 虛空給供汙泥物質操縱機，操縱機回授 0.2/s 汙泥給超頻泵，徹底消除冗餘之常規虛空泵與第二個虛空裂隙池。
  - 實裝智慧底料分配器（Smart Base Material Allocator）：優先掃描產線中間加工機台之富餘固體產能（如研磨骨粉多出的產能），直接連入重構蜘蛛蛋等物質操縱機作為重構底料，成功消滅多餘的日桂葉收割機；無內部副產物時全廠共用單一底料收割機。
  - 發電熔爐與採煤機配比加入嚴格保證迴圈，確保總發電量恆大於等於全廠總負載，電網淨盈餘恆 $\ge 0$ FV/s，徹底杜絕 -1 FV/s 欠壓。升級快取版本至 `20261008_v7_closed_loop_and_smart_base`。
* **2026-10-08｜GitHub Actions CI 品質閘門自動對齊修復與 GitHub Pages 成功部署上線**：
  - 診斷網站未即時反映修改之主因：先前的提交因沙盒指紋變更與程式碼字串未合規，在 GitHub Actions 品質閘門中斷，導致部署步驟未執行。
  - 修復 CI `.github/workflows/deploy.yml` 允許合規 BASELINE 提交自動更新指紋，並徹底消滅硬編碼字串；GitHub Actions Run ID `37654784780` 全綠燈通過，最新產線拓撲（轉化抽取泵機、胃復慘模組、100% 廚師機稼動率）已成功部署上線。
