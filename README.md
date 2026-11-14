# Skill Hub

本機 Web App：以卡片牆瀏覽、搜尋、收藏 GitHub skill 專案，並一鍵安裝、更新、移除到 Devin 與 Cursor。附本機 skill 總覽與規則式智慧推薦。

## 功能

- **GitHub 專案卡片牆** — repo 預覽圖、stars、類型（SKILL / 程式庫）、安裝狀態與分類篩選
- **搜尋與收藏** — GitHub Search API + 手動貼上 repo，磁碟快取降低 API 消耗
- **一鍵安裝 / 更新 / 移除** — 透過 `skills` CLI（釘選 1.7.6）安裝到 `~/.agents/skills`（Devin + Cursor 共用）或 `~/.codeium/windsurf/skills`（Devin 專用），與 `~/.agents/.skill-lock.json` 相容
- **本機 Skill 總覽** — 掃描 Devin / Cursor / Claude 的 skill 目錄，依工具與分類瀏覽
- **智慧推薦** — 依已安裝與收藏的主題產生 GitHub 查詢並規則式評分（不使用 LLM）

## 啟動

需要 Node.js 22.20+。

```bash
npm install
npm run build
npm start        # http://127.0.0.1:4777
```

開發模式（後端 tsx watch + Vite dev server）：

```bash
npm run dev      # 前端 http://localhost:5173，/api 代理到 127.0.0.1:4777
```

## 在其他電腦執行（Windows）

前置需求：Git 與 Node.js 22.20+。要用「安裝 skill」功能的話，該電腦也要先裝好 Devin 或 Cursor（skill 會寫到它們的目錄）。

```bat
git clone https://github.com/emi4a34/Github_Smart__Recommand.git
cd Github_Smart__Recommand
install.bat     :: npm ci + build 前端 + 編譯後端（只需做一次）
start.bat       :: 啟動 http://127.0.0.1:4777
```

之後每次要用只要執行 `start.bat`。GitHub token 到介面「設定」填入即可，不用設環境變數。

## 設定

資料存於 `data/`（gitignored）：`projects.json`、`config.json`、`cache/`。

- GitHub token：到 UI 的「設定」填入，或設環境變數 `GITHUB_TOKEN`。未設 token 時受 GitHub 匿名額度限制（一般 API 60 次/小時、搜尋 10 次/分鐘）。
- 介面預設語言：繁體中文。

## 架構

- `server/`：Hono API（只綁 `127.0.0.1`）。`github.ts` GitHub 客戶端 + 快取；`repoSkills.ts` 由 git tree 找 `SKILL.md`；`inventory.ts` 掃描本機目錄與 lock 檔；`status.ts` 狀態判定；`skillsCli.ts` skills CLI adapter；`recommend.ts` 推薦；`store.ts` 資料讀寫；`validate.ts` 輸入驗證。
- `shared/types.ts`：前後端共用型別。
- `web/`：Vite + React + TypeScript，純 CSS 深色主題。

## 安全

- 只監聽 `127.0.0.1`；API 檢查 Host / Origin，只接受本機來源；寫入請求須為 JSON。
- repo、skill 名稱、agent id 皆經白名單驗證；skills CLI 以參數陣列呼叫、不經 shell。
- token 不寫入 log、不回傳前端。

## 指令

```bash
npm test         # Vitest（不打網路）
npm run typecheck
npm run build
```

詳見 [AGENTS.md](AGENTS.md)。
