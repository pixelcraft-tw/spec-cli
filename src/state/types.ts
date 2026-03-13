export type Phase =
  | 'spec_created'
  | 'clarifying'
  | 'spec_approved'
  | 'plan_pending_approval'
  | 'ready_to_implement'
  | 'implementing'
  | 'completed'
  | 'merged';

export type TaskStatus = 'pending' | 'in_progress' | 'review_pending' | 'complete' | 'skipped';

export type FeatureType = 'feat' | 'fix' | 'refactor' | 'docs' | 'chore';

export type TestStrategy = 'tdd' | 'after' | 'none';
export type TestType = 'unit' | 'intg' | 'both';

export interface TaskState {
  name: string;
  status: TaskStatus;
}

export interface SessionInfo {
  backend: string;
  id: string;
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
  in_progress: ['review_pending'],
  review_pending: ['complete', 'in_progress'], // in_progress = request-change
  complete: [],
  skipped: [],
};
