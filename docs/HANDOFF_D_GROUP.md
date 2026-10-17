# D 組交接：沙盒電力 / 泵機與產線計算機統一

> 交接日期：2026-10-17。前一位 AI 已完成名稱統一、程式清理 A/B/C（HEAD `a10805f`）。
> 本文件是 D 組的**完整任務說明**。開工前請先讀 `AGENTS.md`（強制規則）與 `PROJECT_STATUS.md`。

---

## 0. 一句話目標
沙盒（官方藍圖生成器 + 沙盒物理引擎）的**泵機台數、耗電、哥布林、發電熔爐配置**，必須和產線計算機算出來的**完全一致**，並且一律從 `src/data/machines.json` 讀取機台數值，不再寫死在程式裡。

---

## 1. 遊戲事實（使用者 2026-10-17 親自確認，以此為準，不要自行推測）

| 項目 | 規則 |
|---|---|
| 物質操縱機 | 耗電 **1 FV**、**1 隻**哥布林（同 `machines.json`） |
| 虛空泵機 | 常規或超頻，耗電**都是 1 FV** |
| 泵機超頻條件 | 接上汙泥時才超頻；超頻需要**另外放一台物質操縱機**專門供汙泥（該操縱機 1 FV、1 隻哥布林） |
| 泵機產能 | 常規 2 fl/s；超頻 8 fl/s（虛空泵超頻淨 7 = 8 − 供汙泥自耗 1） |
| 發電熔爐（官方藍圖） | **固定用超頻模式**（使用者選「甲」）：2 熔爐 : 1 採煤機 : 1 供汙泥操縱機，每台熔爐 16 FV 毛產出 |

**產線計算機已經完全符合上表**，它的實作就是唯一標準：
- `src/services/plantInfrastructure.ts`
  - `sizeAutonomousPump(demand, hasVoid)`：泵機階梯（超頻門檻：全廠有虛空設施 > 2 fl/s，否則 > 6 fl/s；需求每 8 fl/s 一台超頻泵 + 餘量處理；每台超頻泵配 1 台供汙泥操縱機；`pumpPower = (超頻泵 + 常規泵 + 操縱機) × 1.0`）
  - `settlePlantInfrastructure(input)`：虛空閉環 + 熔爐數（超頻：`ceil(負載 / 14)`、採煤機 `ceil(熔爐/2)`、供汙泥操縱機 `ceil(熔爐/2)`）

---

## 2. 目前沙盒錯在哪（已逐一確認過程式碼；行號為 `a10805f` 時的大約位置）

| # | 位置 | 問題 |
|---|---|---|
| D1 | `src/services/dishBlueprintPower.ts` 約 L123 `const isOc = totalDemand > 2.0;` 附近 | 自己另寫一套泵機判斷：**永遠只擺 1 台泵**，需求 > 8 fl/s 會供不夠；沒有「無虛空時門檻 6.0」 |
| D2 | `dishBlueprintPower.ts` 約 L171 起（`sludge-manip-…` 節點） | 供汙泥操縱機設成 **2.0 FV / 2 隻哥布林**（應為 1 / 1） |
| D3 | `src/components/Sandbox/sandboxPhysics.ts` 泵機更新邏輯（約 L100-115，超頻分支） | 泵機超頻時把自身改成 **2 FV / 2 隻**（應維持 1 FV）。加上 D2 的操縱機，沙盒一台超頻泵合計 4 FV，計算機是 2 FV |
| D4 | `src/services/dishBlueprintGenerator.ts` 約 L590-605（`totalFurnaceCount = ceil(load / 3.5)` 一帶） | 自己重算發電：**一律擺常規熔爐**（3.5 / 4.0 常數），但藍圖的產線是用 `'overclock'` 模式算的；且泵機耗電以 1.0 加總後物理引擎又改成 2.0，熔爐數可能偏少 |
| D5 | `dishBlueprintGenerator.ts` 約 L350、L588 | 機台名稱寫成 `'泵機'`，**`machines.json` 沒有這台機器**，正確是【虛空泵機】 |
| D6 | `dishBlueprintGenerator.ts`（廚師機 1.0 FV / 3 隻、底料收割機）、`dishBlueprintPower.ts`（發電模組）、`SandboxSimulator.tsx`（手動放置節點，約 L521 / L566 / L607） | 耗電、哥布林寫死在程式裡，應改從 `machines.json` 讀 |
| D7 | `src/services/dishBlueprintLayout.ts` 約 L41 | 環境節點只認 `pool-` / `pump-` / `sludge-manip-` 開頭，**漏掉 `oc-void-pump-…`**（D1 一帶產生），該泵被排進生產區 |
| D8 | `src/services/digitalTwinAudit.ts` | 健康檢查只比對**機台數量**，沒比對**耗電、泵機台數、熔爐數**，所以 D1-D4 一直沒被發現。完成後要把這三項加進比對 |

---

## 3. 建議做法（分步、每步獨立提交）

1. **D5 + D7（名稱與排版，小）**：`'泵機'` → 從資料取得虛空泵機名稱；layout 改用 `type === 'pump'`（排除 `pump-trans-` 原位轉化抽取泵）判斷環境泵。
2. **D1 + D2 + D3（泵機）**：藍圖生成器改呼叫 `sizeAutonomousPump`（或直接使用 `runParallelPlan` 結果裡已經算好的 `infra` / `fluids` 資料），依其回傳的超頻泵、常規泵、操縱機數量建立節點；物理引擎不再在超頻時改泵機耗電。
3. **D4 + D6（電力）**：熔爐數、採煤機、供汙泥操縱機一律取自計算機的 `settlePlantInfrastructure` 結果（超頻模式）；所有機台耗電 / 哥布林從 `machines.json` 讀（可在 `src/utils/` 新增 `machineSpec(name)` 小工具，**先搜尋是否已有類似函式**）。
4. **D8（健康檢查）**：`digitalTwinAudit` 新增「沙盒總耗電 vs 計算機總負載」「泵機台數」「熔爐數」比對，不一致就列為故障。
5. 每一步完成後更新 `docs/CHANGELOG.md`（頂端，詳細）與 `PROJECT_STATUS.md`（近期決策，一行摘要）。

> 每個機台節點都必須用 `makeNode()`（`src/components/Sandbox/sandboxNodeUtils.ts`）建立。物品 / 流體分類只能用 `src/utils/itemTraits.ts`。不得新增硬編碼物品名稱。

---

## 4. 驗證與提交流程（強制）

D 組**一定會改變沙盒計算結果**，所以每一步：

1. 改之前先拍快照：
   ```
   npx tsx scripts/regression/snapshot.ts before.json
   npx tsx scripts/regression/sandboxSnapshot.ts before_sb.json
   ```
2. 修改後拍 `after.json` / `after_sb.json`，用 `node scripts/regression/compare.mjs before.json after.json` 比對。
   - **計算機（solver）快照應該完全不變**（D 組只改沙盒）。若 solver 有變，代表改錯地方，必須修正。
   - 沙盒快照的變化必須都能用上表解釋。
3. **先停下來向使用者報告**：哪些料理變了、拿一道菜列出「改前 / 改後」的泵機台數、總耗電、熔爐數、哥布林數，並說明符合第 1 節哪條規則。**使用者同意後**才：
   ```
   npm run baseline
   npm run check        # 必須全部通過
   npm run build
   ```
   commit 訊息必須含 `BASELINE: 原因`。
4. 推送後確認 GitHub Actions 通過。

**嚴禁**：在 CI 執行 `npm run baseline`、修改 `scripts/check/`、`.github/`、`.githooks/` 或 `package.json` 的 check 腳本、使用 `--no-verify`。CI 失敗就在本機修正。

---

## 5. 其他已知問題（不在 D 組範圍，做之前必須先問使用者）

- `dishBlueprintGenerator.ts` 約 L135-136：底料作物靠「名稱含『桂』」「島名含『波莫拉』」挑選。原因是食材表沒有「底料」欄位，需要使用者決定要不要新增欄位。
- `solver.ts`：用名稱正規表達式判斷原料來源（應改用 `rawSourceMachine()`）；部分原料寫死 0.4 產率；醋 / 炙烈紅油、水 / 油混合機以工序名稱特判。改了會影響計算機結果，需要使用者核准。
- `SandboxSimulator.tsx` 約 L498、`dishBlueprintGenerator.ts` 約 L310：泥沼蟑螂產量寫死 2，應改讀中間配方的 `outputCount`。
- 【冰塊】的腐壞產物【糊糊】未登錄：使用者表示需要時自行登錄，不要動。

---

## 6. 環境備註
- Windows + PowerShell。在命令列直接寫中文字串常被編碼弄壞；搜尋中文請用 `git grep`，或寫成 `.cjs` 腳本再用 node 執行。
- `npm run check` 會印出「Failed to load from localStorage」，屬正常現象。
- 使用者用網頁工作台同步資料後，開工第一步先 `git pull`，在不改程式的狀態下 `npm run baseline`，並單獨 commit `BASELINE: 同步資料更新`。
