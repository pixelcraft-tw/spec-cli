import { execFileSync } from 'node:child_process';

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf-8',
  }).trim();
}

export function gitBranch(branchName: string, cwd?: string): void {
  run('git', ['checkout', '-b', branchName], cwd);
}

export function gitCheckout(branchName: string, cwd?: string): void {
  run('git', ['checkout', branchName], cwd);
}

export function gitCurrentBranch(cwd?: string): string {
  return run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export function gitCommit(message: string, cwd?: string): void {
  run('git', ['add', '-A'], cwd);
  run('git', ['commit', '-m', message], cwd);
}

export function gitDiff(from?: string, to?: string, cwd?: string): string {
  if (from && to) {
    return run('git', ['diff', `${from}..${to}`], cwd);
  }
  if (from) {
    return run('git', ['diff', from], cwd);
  }
  return run('git', ['diff', 'HEAD~1'], cwd);
}

export function gitStatus(cwd?: string): string {
  return run('git', ['status', '--short'], cwd);
}

export function gitMerge(branch: string, squash: boolean = false, cwd?: string): void {
  const args = ['merge'];
  if (squash) args.push('--squash');
  args.push(branch);
  run('git', args, cwd);
}

export function gitLog(n: number = 5, cwd?: string): string {
  return run('git', ['log', '--oneline', `-${n}`], cwd);
}

export function gitDiffBranch(base: string = 'main', cwd?: string): string {
  const mergeBase = run('git', ['merge-base', base, 'HEAD'], cwd);
  return run('git', ['diff', mergeBase], cwd);
}

export function gitRevParseHead(cwd?: string): string {
  return run('git', ['rev-parse', 'HEAD'], cwd);
}

export function gitResetHard(ref: string, cwd?: string): void {
  run('git', ['reset', '--hard', ref], cwd);
}

export function gitDiffStat(from: string, cwd?: string): string {
  return run('git', ['diff', '--stat', from], cwd);
}

export function gitStashPushAll(message: string, cwd?: string): void {
  run('git', ['stash', 'push', '-u', '-m', message], cwd);
}

export function isGitRepo(cwd?: string): boolean {
  try {
    run('git', ['rev-parse', '--is-inside-work-tree'], cwd);
    return true;
  } catch {
    return false;
  }
}
