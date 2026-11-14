# Skill Hub

本機 Web App：瀏覽 / 搜尋 / 推薦 GitHub skill 專案，並透過 `skills` CLI 安裝到 Devin 與 Cursor。

## Commands

- `npm run dev` — 同時啟動後端 (`tsx watch server/index.ts`, 127.0.0.1:4777) 與前端 Vite (5173, `/api` 代理到 4777)
- `npm run dev:server` / `npm run dev:web` — 只啟動單一端
- `npm test` — Vitest（全部測試在 `server/*.test.ts`，不打網路）
- `npm run typecheck` — `tsc --noEmit`（server + web 兩個 tsconfig）
- `npm run build` — `vite build` → `web/dist`
- `npm start` — `tsx server/index.ts`，伺服 `web/dist` 靜態檔 + API（需先 `npm run build`）

## Architecture

- `server/`：Hono API。`index.ts` 路由與 Host/Origin 安全檢查；`github.ts` GitHub API + 磁碟快取（ETag、TTL、rate limit → `RateLimitError`）；`repoSkills.ts` 由 git tree 找 `SKILL.md`；`inventory.ts` 掃描本機 skill 目錄 + `~/.agents/.skill-lock.json`；`status.ts` 判定未安裝/已安裝/可更新/程式庫；`skillsCli.ts` 封裝 `skills` CLI（序列化、參數白名單）；`recommend.ts` 純規則推薦；`store.ts` `data/*.json` 原子讀寫；`validate.ts` 輸入驗證。
- `shared/types.ts`：前後端共用型別。
- `web/`：Vite + React + TS 前端（`vite.config.ts` 在根目錄，root 指向 `web/`）。
- 資料在 `data/`（gitignored）：`projects.json`、`config.json`（含 GitHub token，不可回傳前端）、`cache/`。

## Notes

- 安裝目標：預設「共用」用 skills CLI 的 agent id `cursor`，檔案落在 `~/.agents/skills`（Devin 與 Cursor 都會讀）；「Devin 專用」用 `windsurf`（`~/.codeium/windsurf/skills`）。不要用 CLI 的 `devin` id。
- 移除一律是全工具移除（`skills remove <name> -g -y`，不帶 `-a`），否則會殘留共用目錄與 lock 紀錄。
- `skills` 套件釘在 `1.7.6`，以子程序呼叫 `node_modules/skills/bin/cli.mjs`。
