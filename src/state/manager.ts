import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  type WorkflowState,
  type FeatureState,
  type Phase,
  type ProjectConfig,
  PHASE_GUARDS,
} from './types.js';

const WORKFLOW_DIR = '.workflow';
const STATE_FILE = 'state.yaml';
const CONFIG_FILE = 'config.yaml';

export class StateManager {
  private workflowDir: string;

  constructor(private cwd: string = process.cwd()) {
    this.workflowDir = path.join(cwd, WORKFLOW_DIR);
  }

  get statePath(): string {
    return path.join(this.workflowDir, STATE_FILE);
  }

  get configPath(): string {
    return path.join(this.workflowDir, CONFIG_FILE);
  }

  workflowExists(): boolean {
    return fs.existsSync(this.workflowDir);
  }

  ensureWorkflow(): void {
    if (!this.workflowExists()) {
      throw new Error('Workflow not initialized. Run `pxs init` first.');
    }
  }

  readState(): WorkflowState {
    if (!fs.existsSync(this.statePath)) {
      return { features: [] };
    }
    const content = fs.readFileSync(this.statePath, 'utf-8');
    const data = yaml.load(content) as WorkflowState | null;
    return data ?? { features: [] };
  }

  writeState(state: WorkflowState): void {
    this.ensureWorkflow();
    const content = yaml.dump(state, { lineWidth: -1, noRefs: true });
    fs.writeFileSync(this.statePath, content, 'utf-8');
  }

  getFeature(name: string): FeatureState | undefined {
    const state = this.readState();
    return state.features.find((f) => f.feature === name);
  }

  upsertFeature(feature: FeatureState): void {
    const state = this.readState();
    const idx = state.features.findIndex((f) => f.feature === feature.feature);
    if (idx >= 0) {
      state.features[idx] = feature;
    } else {
      state.features.push(feature);
    }
    this.writeState(state);
  }

  /** Accumulate AI usage (cost/duration) onto a feature and persist it. */
  recordUsage(feature: FeatureState, usage: { costUsd?: number; durationMs?: number }): void {
    if (usage.costUsd === undefined && usage.durationMs === undefined) return;
    feature.usage = {
      cost_usd: (feature.usage?.cost_usd ?? 0) + (usage.costUsd ?? 0),
      duration_ms: (feature.usage?.duration_ms ?? 0) + (usage.durationMs ?? 0),
      runs: (feature.usage?.runs ?? 0) + 1,
    };
    this.upsertFeature(feature);
  }

  checkPhaseGuard(command: string, featureName: string): void {
    const allowedPhases = PHASE_GUARDS[command];
    if (!allowedPhases || allowedPhases.length === 0) return; // any phase allowed

    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error(`Feature "${featureName}" not found in state. Run \`pxs new ${featureName}\` first.`);
    }

    if (!allowedPhases.includes(feature.phase)) {
      throw new Error(
        `Command "pxs ${command}" cannot run in phase "${feature.phase}". ` +
        `Allowed phases: ${allowedPhases.join(', ')}`
      );
    }
  }

  readConfig(): ProjectConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error('Config not found. Run `pxs init` first.');
    }
    const content = fs.readFileSync(this.configPath, 'utf-8');
    return yaml.load(content) as ProjectConfig;
  }

  // Helper paths
  specsDir(): string {
    return path.join(this.workflowDir, 'specs');
  }

  plansDir(): string {
    return path.join(this.workflowDir, 'plans');
  }

  reviewsDir(): string {
    return path.join(this.workflowDir, 'reviews');
  }

  promptsDir(): string {
    return path.join(this.workflowDir, 'prompts');
  }

  logsDir(): string {
    return path.join(this.workflowDir, 'logs');
  }

  templatesDir(): string {
    return path.join(this.workflowDir, 'templates');
  }

  specPath(name: string): string {
    return path.join(this.specsDir(), `${name}.md`);
  }

  planPath(name: string): string {
    return path.join(this.plansDir(), `${name}.md`);
  }

  reviewPath(name: string, taskN: number): string {
    return path.join(this.reviewsDir(), `${name}-task-${taskN}.md`);
  }
}
