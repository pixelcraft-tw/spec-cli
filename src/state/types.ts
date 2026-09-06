export const PHASES = [
  'spec_created',
  'clarifying',
  'spec_approved',
  'plan_pending_approval',
  'ready_to_implement',
  'implementing',
  'completed',
  'merged',
] as const;
export type Phase = (typeof PHASES)[number];

export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'review_pending',
  'complete',
  'skipped',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type FeatureType = 'feat' | 'fix' | 'refactor' | 'docs' | 'chore';

export const REVIEW_MODES = ['agent', 'codex'] as const;
/** agent = isolated Claude Code reviewer · codex = OpenAI Codex CLI reviewer */
export type ReviewMode = (typeof REVIEW_MODES)[number];

/** Independent reviewer selection: which CLI reviews, with what model/effort. */
export interface ReviewChoice {
  mode: ReviewMode;
  model?: string;
  effort?: string;
}

export type TestStrategy = 'tdd' | 'after' | 'none';
export type TestType = 'unit' | 'intg' | 'both';

export interface TaskState {
  name: string;
  status: TaskStatus;
  /**
   * HEAD sha captured once, when the task first enters in_progress.
   * The task's commits are exactly anchor..HEAD — used to scope review
   * diffs, resume interrupted tasks, and reset commits on request-change.
   */
  anchor?: string;
}

export interface SessionInfo {
  backend: string;
  id: string;
}

/** Accumulated AI usage across all backend runs for a feature. */
export interface UsageInfo {
  cost_usd: number;
  duration_ms: number;
  runs: number;
}

export interface FeatureState {
  feature: string;
  type: FeatureType;
  branch: string;
  base_branch?: string;
  phase: Phase;
  total_tasks: number;
  current_task: number;
  session?: SessionInfo;
  usage?: UsageInfo;
  /** Reviewer chosen for this feature (pxs new); overrides config.review. */
  review?: ReviewChoice;
  tasks: TaskState[];
}

export interface WorkflowState {
  features: FeatureState[];
}

export interface ProjectConfig {
  project: {
    name: string;
    language: string;
    framework: string;
    architecture: string;
    lang_framework: string;
  };
  git: {
    convention: string;
  };
  backend: {
    default: string;
  };
  test: {
    strategy: TestStrategy;
    type: TestType;
  };
  review: {
    mode: ReviewMode;
    agent: { model: string; effort: string };
    codex: { model: string; effort: string };
  };
}

// Phase guard: which phases each command is allowed in
export const PHASE_GUARDS: Record<string, Phase[]> = {
  new: [], // any phase (creates new feature)
  refine: ['spec_created', 'clarifying'],
  clarify: ['spec_created', 'spec_approved', 'plan_pending_approval'],
  implement: ['ready_to_implement', 'implementing'],
  review: ['implementing', 'completed'],
  status: [], // any phase
  reset: [], // any phase
  diff: ['ready_to_implement', 'implementing', 'completed', 'merged'],
};

// Valid task status transitions
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'skipped'],
  in_progress: ['review_pending', 'skipped'], // skipped = empty-diff guard
  review_pending: ['complete', 'in_progress', 'skipped'], // in_progress = request-change / add-test
  complete: [],
  skipped: [],
};
