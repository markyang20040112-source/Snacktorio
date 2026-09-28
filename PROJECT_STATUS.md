# 專案開發進度與架構記憶 (Project Status & Architecture Memory)

> **提示**：本檔案由 AI Agent 與開發者共同自動維護，作為跨電腦切換與對話重啟時的即時記憶核心。

---

## 1. 專案基本資訊 (Overview)
* **專案名稱**：Snacktorio 產線規劃與平衡計算系統
* **核心理念**：基於遊戲《Snacktorio》建立全製程產線平衡推導、連續流體與即時電網配置、以及試算表純資料庫驅動維護體系。
* **建立日期**：2026-09-29

---

## 2. 核心技術棧與資產 (Tech Stack & Assets)
* **資料庫與試算表**：`Snacktorio 遊戲資料庫與生產規劃表.xlsx`（前台計算機、多料理並聯規劃、參數庫與底層母庫）
* **核心規範知識庫 (Git/Markdown 模組化體系)**：
  - `docs/README.md`（知識庫總覽、模組導航與核心原則）
  - `docs/01_production_logic_and_physics.md`（產線物理機制與平衡推導規範）
  - `docs/02_spreadsheet_architecture_and_formulas.md`（試算表架構與動態公式手冊）
  - `docs/03_recipe_ingestion_sop_and_case_studies.md`（食譜登錄 SOP 與實戰範本）
* **Python 自動化與校驗環境**：`.venv`（Python 3.14，安裝有 `openpyxl`, `python-docx`, `pandas`）

---

## 3. 當前開發進度與狀態 (Roadmap & Status)
- [x] 專案結構初始化與環境設定（已配置專屬 `.venv` 與 Python 依賴）
- [x] 4 份舊版 Word 手冊解析、重構、去冗餘並全面轉化為 Git 友善之 Markdown 知識庫（`docs/`）
- [x] 確立最高鐵律：Zero-Surprise Protocol（寫入試算表前必須明確提報範圍並獲玩家授權）
- [x] 確立三大擴充原則（未來全面自適應、防資料膨脹、極致精簡體量）與除不盡分數化鐵律（如 `=1/3`, `=2/11`）
- [x] 建立前後端分離規範（前台雙計算機由《計算機參數庫》平鋪驅動，前台零修改自動適配）
- [ ] 接收新食譜截圖或文字並逆向剖析登錄
- [ ] 支援單料理與多料理並聯產線推導與除錯

---

## 4. 近期重要決策日誌 (Decision Log)
* **2026-09-29**：專案從暫存目錄遷移並正式初始化至標準專案目錄 `C:\Users\User\Projects\Snacktorio`，配置 Git 版本控制，並同步設定 `AGENTS.md`、`GEMINI.md` 與 `PROJECT_STATUS.md`。
* **2026-09-29**：重構並整併原 4 份笨重之 Word 手冊，徹底消除重複段落與歷史修訂雜訊，升級為語意化、結構嚴謹且易於跨裝置 GitHub 同步的 Markdown 知識庫（位於 `docs/` 目錄），同步廢止舊版 `.docx` 文件。
