# 目前頁面進度、五人分工與交付標準

這份文件是給組內 handoff 用的。它保留原本五人分工脈絡；目前實際 API 與啟動方式請以 `docs/api-contract.md`、`docs/local-development.md`、`docs/aws-deployment.md` 為準。

前提：

- 後端主幹目前先由你集中維護
- 如果要拆成 5 個人，建議照下面這樣切
- A / B / C / D 主要是前端 scene 與 shared UI
- E 是比較偏平台的角色，會碰到 judge、async、整合驗證、部署與測試
- 這份文件的目的是讓每個人知道：
  - 自己到底負責哪一類功能
  - 目前已經做到哪裡
  - 做到什麼程度才算交付
  - 什麼時候可以開始做，會依賴誰

## 目前已完成的頁面 / View

注意：目前已經有正式 route 分流。登入後會依使用者 role 自動導向對應 workspace。

### 1. Login View

目前已完成到：

- 可用 demo account 登入
- 可直接輸入 email 登入
- 登入後 session 會存到 browser
- 重新整理後若 session 還在，會直接回到登入後狀態
- 登入頁不再顯示三種角色選項
- 登入成功後會依角色導向 `/candidate`、`/interviewer` 或 `/problem-admin`

目前檔案：

- `apps/web/src/App.tsx`
- `apps/web/src/views/LoginPanel.tsx`
- `apps/web/src/lib/session.ts`

### 2. Candidate Workspace

目前已完成到：

- 可看到 candidate 自己被指派的 assignment
- 點選 assignment 後可看到 problem detail
- 可切換 language
- 可輸入程式碼並送出 submission
- 送出後會輪詢 `queued -> running -> finished / failed`
- 頁面上可看到 score、case 結果、error message
- 可用 terminal/custom stdin run 測試目前程式，不會建立正式 submission
- 可檢視每次 submission 的 code snapshot 與 testcase 結果

目前檔案：

- `apps/web/src/views/CandidateWorkspace.tsx`

### 3. Interviewer Workspace

目前已完成到：

- 可載入 problem list
- 可建立 assignment，把 problem 指派給 candidate
- 可查詢 candidate results / submission history
- 可寫 private notes / rubric / recommendation
- 可用 terminal/custom stdin run 測試程式片段

目前檔案：

- `apps/web/src/views/InterviewerWorkspace.tsx`

### 4. Admin Workspace

目前已完成到：

- 可載入 problem list
- 可建立 problem
- 建立後會寫進 PostgreSQL，重啟 backend 不會消失
- 可批次匯入 `.in` / `.out` testcase pair
- 可 preview problem
- 可 archive / restore / force delete problem，刪除前會顯示 impact
- 可建立 user 並設定 `candidate` / `interviewer` / `problem_admin`
- 可查看全站 submission history

目前檔案：

- `apps/web/src/views/ProblemAdminWorkspace.tsx`

### 5. 前端共用殼層

目前已完成到：

- 單一 app 可依角色切換 workspace
- 已有正式 route 分流與 role guard
- candidate / interviewer / admin 不會看到彼此 workspace
- 有共用 API client
- 有基本全域樣式
- 可直接透過 Vite proxy 打 API

目前檔案：

- `apps/web/src/App.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/styles.css`

## 目前還沒完成的東西

- 更細的頁面拆分
- 表單驗證體驗優化
- loading / empty / error state 統一
- 更完整的 async 狀態處理
- smoke test / E2E test
- prettier 的資訊呈現

## 五人建議分工

### 組員 A: Candidate Flow Owner

> 就是負責所有 candidate 看得到、操作得到、要送 code 的東西

主要負責內容：

- assignment list 區塊
- problem detail 顯示區塊
- code editor / textarea 區塊
- submission result 區塊
- candidate 頁面內的 loading / empty / error state

建議主要檔案：

- `apps/web/src/views/CandidateWorkspace.tsx`
- 之後可以拆到 `apps/web/src/views/candidate/*`

做到這樣算完成：

- candidate 登入後，可以完整走完：
  - 看 assignment
  - 看題目
  - 選語言
  - 貼 code
  - 送出 submission
  - 等結果
- assignment list 至少有清楚的「目前選到哪題」狀態
- problem detail 排版不會難讀，sample input / output 清楚
- submit 期間按鈕有 disabled / loading 狀態
- result 區塊能清楚區分：
  - `queued`
  - `running`
  - `finished`
  - `failed`
- 至少驗過 1 次成功 submission 和 1 次失敗 submission

涉及技術：

- React component split
- local state
- polling UX
- form state
- candidate workflow design

可能碰到的具體技術：

- React
- TypeScript
- fetch API client
- status badge / state rendering
- Monaco Editor 或簡單 textarea 強化

依賴與阻塞：

- 現在就可以開始
- 主要依賴既有 `/me/assignments`、`/me/problems/:id`、`/me/submissions`
- 不需要等別人先改 backend
- 做完後會讓組員 E 更容易補 async 驗證和 smoke test

### 組員 B: Interviewer Flow Owner

> 就是負責所有 interviewer 在管理 candidate、指派題目、查成績時會用到的畫面

主要負責內容：

- create assignment 表單
- candidate results 查詢區塊
- interviewer 的頁面流程整理
- interviewer 頁面內的 loading / empty / error state

建議主要檔案：

- `apps/web/src/views/InterviewerWorkspace.tsx`
- 之後可以拆到 `apps/web/src/views/interviewer/*`

做到這樣算完成：

- interviewer 登入後，可以完整走完：
  - 看 problem list
  - 選 candidate
  - 指派 problem
  - 查 candidate results
- assignment form 欄位清楚，不會讓 demo 時不知道要填什麼
- 建立 assignment 成功後，畫面會明確顯示成功結果
- 查不到 candidate 或 API 回錯誤時，畫面有清楚提示
- result list 至少能看懂：
  - candidate 是誰
  - 交了哪題
  - 狀態是什麼
  - score 是多少

涉及技術：

- admin form UX
- table / list rendering
- workflow organization
- error handling

可能碰到的具體技術：

- React
- TypeScript
- reusable form components
- result table / card UI

依賴與阻塞：

- 現在就可以開始
- 主要依賴 `/admin/problems`、`/admin/assignments`、`/admin/candidates/:id/results`
- 若 admin 新增更多題目，B 的畫面會更好 demo，但不影響先做

### 組員 C: Admin Flow Owner

> 就是負責所有出題主管會碰到的東西，也就是建題、看題、整理題目資料

主要負責內容：

- create problem form
- problem list 顯示
- sample input / output 呈現
- create problem 成功 / 失敗回饋

建議主要檔案：

- `apps/web/src/views/ProblemAdminWorkspace.tsx`
- 之後可以拆到 `apps/web/src/views/problem-admin/*`

做到這樣算完成：

- admin 登入後，可以完整走完：
  - 看 problem list
  - 填 form
  - 建 problem
  - 看到新 problem 出現在列表
- 空欄位或不合理欄位至少有基本驗證
- difficulty、time limit、sample input、sample output 都有清楚顯示
- form submit 時有 loading 狀態
- 建題失敗時有錯誤提示

涉及技術：

- admin form design
- input validation UX
- list view
- domain data presentation

可能碰到的具體技術：

- React
- TypeScript
- form component abstraction
- validation message rendering

依賴與阻塞：

- 現在就可以開始
- 主要依賴 `/admin/problems`
- 做完後會讓組員 B 的 assignment flow 更好用，因為 problem list 來源會更完整

### 組員 D: Frontend Platform / Shared UI Owner

> 就是負責所有共用的前端骨架，不是某一個角色畫面，而是大家都會碰到的殼層和共享元件

主要負責內容：

- route / role guard
- app layout / navigation
- `App.tsx` 的 route shell 整理
- 共用元件抽離
- styles 結構整理
- 共用 loading / empty / error 元件
- workspace navigation

建議主要檔案：

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/api.ts`
- 之後可以新增 `apps/web/src/components/*`

做到這樣算完成：

- A / B / C 不需要一直改 `App.tsx` 才能做自己的頁面
- 至少有一層清楚的 app shell，讓使用者知道自己目前在哪個 workspace
- `/login` 不直接露出三種角色入口
- 不同 role route 會做 redirect / guard
- 共用按鈕 / 表單區塊 / 卡片樣式有抽出來，不是三個頁面各寫一套
- 至少把 loading、empty、error 的樣式做成共用模式
- 若要新增一個新頁面，不需要先大改整個 app 結構

涉及技術：

- app architecture
- shared component design
- route management
- CSS organization

可能碰到的具體技術：

- React Router
- React
- TypeScript
- shared hooks / shared components
- CSS module 化思路或分檔整理

依賴與阻塞：

- 最好最先開始
- D 先做完一個「不改功能、只整理殼層」的小 PR，其他人再往自己的 area 疊
- D 做完會明顯降低 A / B / C 互相 merge conflict 的機率

### 組員 E: Judge / Async / Platform Owner

> 就是負責所有和「背景批改、async 狀態、平台穩定性」有關的東西，不只前端，還包含 judge worker、整合驗證和部署骨架

主要負責內容：

- `apps/judge-worker` 主責
- queue / worker 流程設計
- submission 狀態流轉
- 至少兩種語言的 judge runner 規劃與實作
- Docker sandbox、timeout / memory / process limit 的第一版策略
- 前端 polling / async 顯示對齊
- 真實 code execution 情境驗證
- smoke test / integration test / demo 驗證流程
- Docker Compose 與本地 demo 穩定性
- 後續若要上雲，優先接 deployment 骨架

建議主要檔案：

- `apps/judge-worker/*`
- `apps/api/src/infra/judge-queue.ts`
- `apps/api/src/modules/submissions/*`
- `apps/web/src/lib/api.ts`
- `apps/web/src/views/CandidateWorkspace.tsx` 的 async 邏輯部分
- `infra/*`
- 之後可以新增：
  - `apps/web/src/hooks/*`
  - `apps/web/src/tests/*`
  - `apps/web/src/components/status/*`
  - `apps/judge-worker/src/runtimes/*`
  - `apps/judge-worker/src/queue/*`

做到這樣算完成：

- 至少把 submission 的 `queued -> running -> finished / failed` 做成明確的狀態流，不要散在一堆地方
- judge worker 不再只是 placeholder，而是有一版可跑的 consumer / runner 骨架
- 至少支援 2 種語言的第一版執行流程
- 至少有 timeout 機制，避免 submission 無限卡住
- 至少能明確重現 4 種 demo 情境：
  - 成功
  - compile error
  - runtime / timeout error
  - wrong answer
- 至少有一份 smoke test checklist，其他人照著跑也能驗證自己的頁面與 judge 狀態
- 至少驗過一次：
  - candidate flow
  - interviewer flow
  - admin flow
- 如果後端 async 狀態有小改動，E 要先確認前端顯示不會壞掉
- 至少有一版本地可重現的 `docker compose up` 或等價啟動方式

涉及技術：

- queue-based async processing
- Docker-based sandboxing
- async state management
- polling / retry
- judge runner design
- deployment / local infra
- integration testing
- regression verification
- reliability basics

可能碰到的具體技術：

- Docker
- Docker Compose
- Redis
- child process / runtime execution
- React hooks
- TypeScript
- fetch / async control
- Vitest
- Playwright 或手動 smoke script
- language runtime management

依賴與阻塞：

- 現在就可以開始，因為 repo 已經有可跑的 `apps/judge-worker`
- 最好和 A、D 同步進行
- A 把 candidate 畫面整理好之後，E 會更容易抽 async 顯示邏輯
- 若你之後調整 Redis queue retry 策略或 sandbox worker 行為，E 會是第一個要跟著驗證 submission 狀態是否還一致的人
- E 做完會直接 cover spec 裡最容易漏掉的 async / scalability / deployment / test 幾塊

## Spec 對應檢查

這一段是拿目前分工去對 spec，看有沒有哪條需求沒有人接。

### 已有 owner 的需求

- 面試者可以登入
  - A 負責 candidate login 後的前端 flow
  - 你負責後端 auth 主幹
- 面試者可以取題並上傳解答
  - A 負責 candidate 頁面
  - 你負責 submissions API
- 出題主管可以建立題目
  - C 負責 admin 頁面
  - 你負責 problems API
- 面試主管可以指定每位面試者的題目
  - B 負責 assignment / results 頁面
  - 你負責 assignments API
- 面試主管可以在後台檢視面試者的成績
  - B 負責 interviewer results 畫面
  - 你負責 results API
- 批改在後端背景執行，關頁回來仍能看到結果
  - E 負責 judge / async / polling / queue 相關工作
  - 你負責 API 與資料層
- 系統至少支援兩種程式語言
  - E 負責 judge runner
- 容易部署到新的 server
  - E 負責 Docker / Compose / deployment 骨架
- 基本測試與整合驗證
  - E 主責 smoke / integration / demo 驗證

### 目前還要特別注意，不然容易漏掉的需求

- 面試主管可以建立面試者帳號
  - 目前 UI 還沒有一個明確的 candidate account management 區塊
  - 建議先由 B 補 interviewer 端的 candidate 管理入口
  - 你要補後端 account creation API
- 題目要能設定預期輸入與輸出、執行時間限制
  - C 的 UI 要補 time limit / sample input / output / hidden test case 表達
  - 你要補對應 schema 與 API
- 惡意程式碼不能影響系統或造成外洩
  - 這塊主要是 E + 你
  - 包含 sandbox、resource limit、network isolation
- 多人同時繳交答案，批改不能塞車太嚴重
  - 這塊主要是 E + 你
  - 包含 queue、worker scaling、job retry
- 大量耗資源或耗時程式不能拖垮系統
  - 這塊主要是 E + 你
  - 包含 timeout、memory / process limit
- 避免作弊、抄襲、偷系統測資
  - 這塊目前還沒有完整 owner
  - 最低限度建議先做到：
    - hidden test case 不暴露
    - judge log 不洩漏測資
    - submission 結果不回傳過多內部細節
- 測試覆蓋率、e2e、integration、load / stress / performance
  - E 先主責 smoke / integration / e2e
  - load / stress / performance 目前還沒有完整實作 owner，建議後續由 E 延伸接手

## 共用檔案 ownership

這幾個地方最容易撞：

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/api.ts`

建議規則：

- A 主要不要碰 `App.tsx`
- B 主要不要碰 `App.tsx`
- C 主要不要碰 `App.tsx`
- D 是這三個共用檔案的主要 owner
- E 若要碰 `lib/api.ts` 或 async 共用邏輯，先和 D 對齊

## 前端共同規則

- 後端 contract 不要自己改
- API shape 以 `docs/api-contract.md` 為準
- 共用 API client 優先放在 `apps/web/src/lib/`
- 共用 UI 不要複製貼上，能抽就抽
- 若要大改共用檔案，先切一個獨立 PR，不要和 scene 功能混在一起

## 每個人交付時至少要附什麼

- 自己改了哪些檔案
- 自己的畫面是從哪個帳號登入驗證的
- happy path 怎麼跑
- 至少 1 個 error path 怎麼重現
- 目前還缺什麼

## 建議接手順序

1. 先讀 `docs/api-contract.md`
2. 在本機跑 `npm run dev:api` 和 `npm run dev:web`
3. 用 demo 帳號把目前 candidate / interviewer / admin 三種 flow 都走過一次
4. 先由 D 開一個共用殼層整理 PR
5. A / B / C 開始並行做各自 scene
6. E 同步補 async 驗證、smoke test 和狀態整合

## 一句話總結

現在不是從零開始做前端，而是：

- 已經有一個能 login 的 app
- 已經有 candidate / interviewer / admin 三種可 demo workspace
- 五個人應該拆成：
  - candidate
  - interviewer
  - admin
  - shared platform
  - async / integration / testing
- 每個人都要把自己那塊做成「可 demo、可驗證、別人接得上」的程度
