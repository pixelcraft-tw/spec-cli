# @pixelcraft-tw/spec (pxs)

Spec-driven development CLI for Claude Code. Write a spec, refine a plan, implement task by task — all powered by AI.

`@pixelcraft-tw/spec` 是一套為 Claude Code 設計的規格驅動開發 CLI。撰寫規格、拆解計畫、逐步實作，全程 AI 驅動。

> **Supported backends: Claude Code**

---

## Installation / 安裝

```bash
npm install -g @pixelcraft-tw/spec
```

## Quick Start / 快速開始

```bash
# 1. Initialize workflow in your project / 初始化工作流
pxs init

# 2. Create a spec / 建立規格
pxs new login-feature --desc "Add JWT login endpoint"

# 3. Refine spec into implementation plan / 拆解為實作計畫
pxs refine login-feature

# 4. Implement task by task / 逐步實作
pxs implement login-feature

# 5. Check status / 查看狀態
pxs status login-feature
```

## Commands / 指令

### `pxs init`

Initialize `.workflow/` directory and Claude Code slash commands for your project.

在專案中初始化 `.workflow/` 目錄與 Claude Code slash commands。

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing `.workflow/` / 覆蓋現有目錄 |

### `pxs new <name>`

Create a new spec file under `.workflow/specs/`.

建立新的規格檔案。

| Option | Description |
|--------|-------------|
| `--desc <text>` | Generate spec from text description / 從文字描述產生規格 |
| `--jira <tickets...>` | Import from Jira tickets via MCP / 透過 Jira MCP 匯入 ticket 內容 |
| `-i, --interactive` | Interactive Q&A mode / 互動問答模式 |

### `pxs refine <name>`

Refine spec and decompose into a step-by-step implementation plan.

精煉規格並拆解為逐步實作計畫。

| Option | Description |
|--------|-------------|
| `--skip-clarify` | Skip requirement clarification / 跳過需求釐清 |
| `--clarify <n>` | Max clarification rounds / 最大釐清輪數 |
| `@agent /skill` | Pass agents or skills to assist / 指定 agent 或 skill 協助 |

### `pxs clarify <name>`

Run requirement clarification on a spec independently.

獨立執行需求釐清。

### `pxs implement <name>`

Implement code task by task with AI. Each task goes through: implement → commit → test (optional) → AI review → user approval.

AI 逐步實作。每個 task 流程：實作 → commit → 測試（可選）→ AI review → 使用者審核。

After all tasks complete, a **final branch code review** runs automatically against the full diff, spec, and plan.

所有 task 完成後，自動執行**整個 branch 的完整 code review**。

| Option | Description |
|--------|-------------|
| `--skip-review` | Skip final branch code review / 跳過最終 code review |
| `@agent /skill` | Pass agents or skills to assist review / 指定 agent 或 skill 協助 review |

**Test strategies / 測試策略:**

| Flag | Behavior |
|------|----------|
| `--test tdd` | TDD: write failing tests → implement → pass → refactor |
| `--test intg` | Post-hoc integration tests / 整合測試 |
| `--test tdd intg` | TDD + integration tests |
| `--test` | Post-hoc unit tests / 單元測試 |
| *(none)* | No tests / 不產生測試 |

### `pxs review <name>`

View review records.

查看 review 紀錄。

| Option | Description |
|--------|-------------|
| `--step <n>` | View specific task review / 查看特定 task 的 review |
| `--summary` | Summary overview of all tasks / 所有 task 的摘要 |
| *(default)* | Shows final branch review if completed, otherwise latest task review / 預設顯示 final review 或最新的 task review |

### `pxs status [name]`

View workflow status. Without `<name>`, lists all features.

查看工作流狀態。不帶 `<name>` 則列出所有 feature。

### `pxs reset <name>`

Reset a feature's phase when state gets stuck. Clears downstream state (tasks, session) as appropriate.

重置 feature 的 phase。當 state 卡住時使用，會清除對應的下游狀態。

| Option | Description |
|--------|-------------|
| `--to <phase>` | Target phase (default: `spec_created`) / 目標 phase |

Valid targets: `spec_created`, `clarifying`, `spec_approved`, `plan_pending_approval`, `ready_to_implement`

### `pxs diff <name>`

Show remaining tasks from the implementation plan, grouped by done/in-progress/remaining with progress percentage.

顯示實作計畫中各 task 的完成狀態，分為已完成、進行中、待做，並顯示進度百分比。

## Workflow / 工作流程

```
pxs init → pxs new → pxs refine → pxs implement → merge
                         │                │
                     pxs clarify      pxs diff (check progress)
                     (optional)       pxs reset (unstick)
```

```
implement 流程：

  Task 1 → commit → [test] → AI review → approve/skip
  Task 2 → commit → [test] → AI review → approve/skip
  ...
  All tasks complete
       ↓
  Final Code Review (full branch diff vs spec + plan)
       ↓
  merge / squash-merge / keep-branch
```

## Claude Code Integration

After `pxs init`, the following slash commands are available in Claude Code:

執行 `pxs init` 後，可在 Claude Code 中使用以下 slash commands：

| Slash Command | Description |
|---------------|-------------|
| `/pxs.new` | Create a new spec / 建立規格 |
| `/pxs.refine` | Refine spec into plan / 拆解計畫 |
| `/pxs.clarify` | Clarify requirements / 釐清需求 |
| `/pxs.implement` | Implement task by task / 逐步實作 |
| `/pxs.review` | View reviews / 查看 review |
| `/pxs.status` | Check status / 查看狀態 |
| `/pxs.reset` | Reset feature phase / 重置 feature 狀態 |
| `/pxs.diff` | Show task progress / 查看 task 進度 |

## Project Structure / 專案結構

```
.workflow/
├── state.yaml          # Workflow state / 工作流狀態
├── config.yaml         # Project config / 專案設定
├── specs/              # Feature specs / 功能規格
├── plans/              # Implementation plans / 實作計畫
├── reviews/            # AI review records / AI review 紀錄
└── prompts/            # Prompt templates / Prompt 模板
```

## License

MIT
