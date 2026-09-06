# @pixelcraft-tw/spec (pxs)

Spec-driven development CLI for Claude Code. Write a spec, refine a plan, implement task by task — all powered by AI.

`@pixelcraft-tw/spec` 是一套為 Claude Code 設計的規格驅動開發 CLI。撰寫規格、拆解計畫、逐步實作，全程 AI 驅動。

> **Supported backends: Claude Code · OpenAI Codex CLI (as the independent reviewer)**

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
| `--review-mode <agent\|codex>` | Pre-select the independent reviewer for this feature (skips the prompt) / 預先指定 reviewer，略過詢問 |
| `--review-model <model>` | Reviewer model / reviewer 模型 |
| `--review-effort <level>` | Reviewer effort / reviewer 推理強度 |

When the `codex` CLI is installed, `pxs new` asks — from lists, nothing to type — which independent reviewer, model and effort to use for this feature, and stores the choice under the feature in `state.yaml`. See [Independent Review](#independent-review--獨立-review).

若已安裝 `codex` CLI，`pxs new` 會用清單詢問這個 feature 要用哪種獨立 reviewer、模型與推理強度，並記錄在 `state.yaml`。

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

Implement code task by task with AI. Each task goes through: implement → commit → test (optional) → **independent** AI review → user approval. The reviewer is never the session that wrote the code (see [Independent Review](#independent-review--獨立-review)).

AI 逐步實作。每個 task 流程：實作 → commit → 測試（可選）→ **獨立** AI review → 使用者審核。Reviewer 永遠不是寫程式的那個 session。

After all tasks complete, an **independent final branch review** runs automatically against the full diff, spec, and plan.

所有 task 完成後，自動執行**獨立的整個 branch code review**。

| Option | Description |
|--------|-------------|
| `--backend <name>` | Implementer backend (`claude` \| `codex`) / 實作用的 backend |
| `--review-mode <agent\|codex>` | Independent reviewer for this run / 本次執行的獨立 reviewer |
| `--review-model <model>` | Reviewer model (claude alias/id, or codex model id) / reviewer 模型 |
| `--review-effort <level>` | Reviewer effort (claude: `low\|medium\|high\|xhigh\|max`; codex: model-dependent, e.g. `low\|medium\|high\|xhigh`) / reviewer 推理強度 |
| `--docs <paths...>` | Reference documents fed to the reviewer / 給 reviewer 的參考文件 |
| `--skip-review` | Skip final branch code review / 跳過最終 code review |
| `--yes` | Non-interactive: auto-approve `PASS` reviews, **stop with exit 1 on `NEEDS_CHANGES`**, keep branch (CI/automation) / 非互動模式：PASS 自動核可，NEEDS_CHANGES 則中止並回傳 exit 1 |
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

View review records, or re-run the independent final review.

查看 review 紀錄，或重新執行獨立的 final review。

| Option | Description |
|--------|-------------|
| `--step <n>` | View specific task review / 查看特定 task 的 review |
| `--summary` | Summary overview of all tasks / 所有 task 的摘要 |
| `--run` | Re-run the independent final review now (spec & document conformance) / 立即重跑獨立 final review |
| `--review-mode` `--review-model` `--review-effort` | Reviewer for `--run` (same as `implement`) / `--run` 使用的 reviewer |
| `--docs <paths...>` | Reference documents fed to the reviewer / 給 reviewer 的參考文件 |
| *(default)* | Shows final branch review if completed, otherwise latest task review / 預設顯示 final review 或最新的 task review |

### `pxs status [name]`

View workflow status, including accumulated AI cost, duration, and run count per feature. Without `<name>`, lists all features.

查看工作流狀態，含每個 feature 累積的 AI 成本、耗時與執行次數。不帶 `<name>` 則列出所有 feature。

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

## Independent Review / 獨立 Review

Reviews are never produced by the session that wrote the code. Every task review and the final branch review run in a **fresh, read-only** session on the reviewer's own backend, model and effort:

Review 永遠不是由寫程式的那個 session 產生。每個 task review 與 final review 都在**全新、唯讀**的 session 執行，使用 reviewer 自己的 backend、模型與推理強度：

| Mode | Reviewer | Model | Effort | Read-only guarantee |
|------|----------|-------|--------|---------------------|
| `agent` (default) | Isolated Claude Code process (`claude -p`); `pxs-reviewer` subagent in slash commands | `fable` `opus` `sonnet` `haiku` or a full id | `low` `medium` `high` `xhigh` `max` | Editor tools disabled (`--disallowedTools`) |
| `codex` | OpenAI Codex CLI (`codex exec`) — cross-vendor second opinion | Any model the local `codex` lists (e.g. `gpt-5.5`) | Model-dependent: `low` `medium` `high` `xhigh` (newer models add `max`/`ultra`) | OS sandbox (`-s read-only`) |

Precedence: CLI flags → the feature's `review:` block in `state.yaml` (chosen by `pxs new`) → `review:` in `config.yaml`:

```yaml
# .workflow/config.yaml
review:
  mode: agent            # agent | codex
  agent:
    model: ""            # empty = CLI default
    effort: ""
  codex:
    model: ""            # empty = ~/.codex/config.toml default
    effort: ""
```

Notes / 注意：
- `codex` mode needs `codex login`; it reports tokens but no USD cost, so the feature's cost total only covers Claude runs. / `codex` 模式需要先 `codex login`；不回報美元成本。
- pxs drives the `codex` CLI directly rather than the `/codex:review` plugin command, because that command accepts a model but has no effort setting. / pxs 直接呼叫 `codex` CLI，而非 `/codex:review` 外掛指令，因為該指令只能選模型、不能選推理強度。
- The reviewer CLI is checked before any task is implemented; a missing CLI or an unknown mode fails fast instead of silently falling back to self-review. / reviewer CLI 在實作前就檢查，缺少時直接失敗，不會退回自我 review。
- In `--yes` mode a `NEEDS_CHANGES` verdict stops the run with exit 1 and leaves the task `review_pending`. / `--yes` 模式下 `NEEDS_CHANGES` 會中止並回傳 exit 1。

## Workflow / 工作流程

```
pxs init → pxs new → pxs refine → pxs implement → merge
                         │                │
                     pxs clarify      pxs diff (check progress)
                     (optional)       pxs reset (unstick)
```

```
implement 流程：

  Task 1 → commit → [test] → independent review → approve/skip
  Task 2 → commit → [test] → independent review → approve/skip
  ...
  All tasks complete
       ↓
  Independent Final Review (full branch diff vs spec + plan)
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
| `/pxs.review` | View reviews, `--run` re-runs the independent final review / 查看 review，`--run` 重跑獨立 final review |
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
├── logs/               # Raw AI output per run, for debugging / 每次執行的原始輸出
└── prompts/            # Prompt templates / Prompt 模板

.claude/
├── commands/pxs.*.md   # Slash commands / Slash 指令
└── agents/pxs-reviewer.md  # Independent read-only reviewer subagent / 獨立唯讀 reviewer 子代理
```

## License

MIT
