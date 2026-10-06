# 專案代理人準則 (Project AI Agent Guidelines)

這是一份針對《Snacktorio》產線規劃與資料庫維護專案的 AI 自主工作規範。每當任何 AI Agent 開啟此工作區時，必須嚴格遵守以下工作流程：

## 1. 啟動與記憶同步 (Session Start & Memory Hydration)
- **優先讀取狀態**：在執行任何開發指令或回答實質問題前，先讀取專案根目錄的 `PROJECT_STATUS.md` 與 `GEMINI.md`。
- **角色定位**：Snacktorio 自動化產線架構師與平衡計算專家。
- **掌握當前上下文**：理解《機器設備》、《食材&物品》、《中間配方》、《食譜》、《計算機參數庫》之關聯，以及前台雙計算機（產線計算機、多料理並聯規劃）之運算邏輯。

## 2. 核心資料庫寫入前置確認 (Zero-Surprise Protocol)
- 在對核心資料庫（`src/data/*.json`）執行重大批次「修改、清空、重構或覆寫」操作前，**必須主動向使用者提出明確的變更計劃**（說明目標檔案、修改內容與計算影響）。
- **必須獲得使用者明確確認同意後，方可調用工具執行寫入**。嚴禁未經確認逕行非預期的資料破壞。

## 3. 三大擴充設計與防禦性原則
- **未來全面自適應**：新增之結構、演算法或功能必須具備高度自適應能力，能全自動兼顧並適配未來任何全新食譜。
- **純文字資料庫驅動 (Data-Driven)**：前端產線計算機、並聯規劃、自由沙盒一律由 `src/data/*.json` 動態平鋪驅動，嚴禁硬編碼靜態配方。
- **極致精簡與輕量體量**：提煉本質物理邏輯，以最小資料體量達成最高效率運算。
- **浮點數精度原則**：處理循環或除不盡產率基準（如 1/3, 1/6, 1/11, 2/11）確保計算精度無損。
- **圖片簡化原則**：終端食譜不建立料理成品圖示，圖標對照表與圖標庫嚴禁收錄終端菜餚，一律以機台圖示（自動廚師機）或精簡徽章呈現。

## 4. 即時記憶維護 (Memory Maintenance)
- **主動更新進度**：每當完成新食譜登錄、公式調整、產線優化或重要決策時，**必須主動更新 `PROJECT_STATUS.md`**。
- **紀錄分層**：詳細決策原文追加至 `docs/CHANGELOG.md` 頂端；`PROJECT_STATUS.md` 僅更新現況摘要、有效規則與「近期決策摘要」（保留最近約 10 筆），避免檔案膨脹。

## 5. Git 版本控制規範
- 在完成重大配方登錄、功能實裝或架構更新後，主動進行清楚的 Git Commit 並推送至 GitHub。
- **提交前必須執行 `npm run check` 並全部通過**（見第 6 節）。嚴禁使用 `git commit --no-verify` 跳過檢查。

## 6. 品質閘門 (Quality Gate) — 強制
`npm run check` = TypeScript 型別檢查 + 資料 lint + 程式守門 + 回歸指紋。pre-commit hook 會自動執行；GitHub Actions 未通過則**不會部署**。

| 檢查 | 失敗代表什麼 | 正確處理方式 |
|---|---|---|
| `[資料]` 引用不存在的名稱 / 重複 / 中間產物未登錄 | 名稱打錯或漏登錄 | 修正資料（仍須遵守第 2 節先徵得使用者同意）。**無法用 baseline 接受** |
| `[名稱]` 新出現只差一個字的名稱 | 高機率是錯字（如 沙沙醬 / 莎莎醬） | 是錯字就統一；確實是不同物品須先問使用者，同意後才 `npm run baseline` |
| `[程式]` 新增硬編碼物品名稱 | 違反資料驅動原則 | 改由 `src/data/*.json` 推導，見下方「寫程式慣例」 |
| `[程式]` 單檔超過行數上限（800 行；既有大檔不得再變大） | 檔案過於攏長 | 拆出子元件 / 工具模組 |
| `[回歸]` 計算結果與基準不同 | 計算邏輯被改變 | **重構**：代表改壞了，必須修正程式，不得更新基準。**刻意修改**（新食譜、公式調整、使用者要求的行為變更）：`npm run baseline`，commit 訊息必須寫 `BASELINE: 原因`（CI 會擋下沒寫的推送），並記入 CHANGELOG |
| `⚠ src/data 已在基準建立後被修改` | 使用者用網頁工作台同步了資料，回歸比對暫停 | **開工第一步**：先 `git pull`，在不改程式的狀態下 `npm run baseline`，單獨 commit `BASELINE: 同步資料更新`，之後再改程式，回歸比對才會恢復保護 |

### 寫程式慣例
- **物品分類只能經由 `src/utils/itemTraits.ts`**：流體判定 `buildFluidNameSet` / `isFluidName`、原料來源機台 `rawSourceMachine`（依 `items.source`）、可腐壞食材 `perishableItems`、環境流體 `ENV_FLUIDS`。需要新的分類時，在此檔新增「由資料欄位推導」的函式，**嚴禁自行判斷或寫死物品清單**；資料欄位不足以判斷時，先問使用者。
- **沙盒節點一律用 `makeNode()`**（`src/components/Sandbox/sandboxNodeUtils.ts`）建立，不要手寫整個 `SandboxNodeData` 物件。
- 官方藍圖由 `src/services/builtInBlueprints.ts` 於執行期自動生成，**不要**把藍圖寫回 `src/data/sandboxBlueprints.json`。
- 新增檔案前先搜尋是否已有相同功能的函式，避免重複實作。
- 需要逐欄查看計算差異時：`npx tsx scripts/regression/snapshot.ts before.json` → 修改 → `after.json` → `node scripts/regression/compare.mjs before.json after.json`。
