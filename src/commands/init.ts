import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProject } from '../discovery/project.js';
import * as display from '../utils/display.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Walk up from __dirname to find the project root containing templates/
function findTemplatesDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'templates');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  // Fallback: 3 levels up from dist/src/commands/ to package root
  return path.resolve(__dirname, '..', '..', '..', 'templates');
}

const TEMPLATES_DIR = findTemplatesDir();

// Resolve shorthand --lang values to full lang_framework IDs
const LANG_SHORTHANDS: Record<string, string> = {
  go: 'go-std',
  typescript: 'typescript-express',
  ts: 'typescript-express',
  nestjs: 'typescript-nestjs',
  express: 'typescript-express',
  csharp: 'csharp-aspnet',
  'c#': 'csharp-aspnet',
  dotnet: 'csharp-aspnet',
  python: 'python-fastapi',
  fastapi: 'python-fastapi',
  django: 'python-django',
  gin: 'go-gin',
  chi: 'go-chi',
  flutter: 'dart-flutter',
  dart: 'dart-flutter',
  ios: 'swift-ios',
  swift: 'swift-ios',
  android: 'kotlin-android',
  kotlin: 'kotlin-android',
};

export function resolveLangFramework(lang: string): string {
  return LANG_SHORTHANDS[lang.toLowerCase()] ?? lang;
}

export async function initCommand(options: { force?: boolean; arch?: string; lang?: string }): Promise<void> {
  const cwd = process.cwd();
  const workflowDir = path.join(cwd, '.workflow');

  if (fs.existsSync(workflowDir) && !options.force) {
    display.error('.workflow/ already exists. Use --force to overwrite.');
    return;
  }

  display.heading('Initializing pxs workflow');

  // Detect project
  const project = detectProject(cwd);
  display.info(`Detected: ${project.language || 'unknown'} / ${project.framework || 'unknown'}`);

  // Create .workflow directories
  const dirs = [
    '.workflow/prompts',
    '.workflow/templates',
    '.workflow/specs',
    '.workflow/plans',
    '.workflow/reviews',
    '.claude/commands',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  }

  // Copy workflow templates
  copyDir(path.join(TEMPLATES_DIR, 'workflow'), workflowDir);

  // Resolve architecture and lang_framework
  const architecture = options.arch ?? 'none';
  const langFramework = options.lang
    ? resolveLangFramework(options.lang)
    : project.lang_framework;

  // Handle --arch: copy architecture template to .workflow/architecture.md
  if (options.arch) {
    const archMdPath = path.join(workflowDir, 'architecture.md');

    if (options.arch === 'custom') {
      // For custom, the next positional arg would be a path — but Commander captures it as the arch value.
      // Actually, `--arch custom` means the user provides a separate file. We check process.argv for a path after 'custom'.
      const customPath = findCustomArchPath();
      if (customPath && fs.existsSync(customPath)) {
        fs.copyFileSync(customPath, archMdPath);
        display.success(`Copied custom architecture from ${customPath}`);
      } else {
        display.error('Custom architecture file not found. Usage: pxs init --arch custom <path>');
      }
    } else {
      // Look up template: templates/architectures/<arch>/<lang_framework>.md
      const templatePath = path.join(TEMPLATES_DIR, 'architectures', options.arch, `${langFramework}.md`);
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, archMdPath);
        display.success(`Architecture: ${options.arch} (${langFramework})`);
      } else {
        display.error(`Architecture template not found: ${options.arch}/${langFramework}.md — skipping architecture.md`);
        const archDir = path.join(TEMPLATES_DIR, 'architectures', options.arch);
        if (fs.existsSync(archDir)) {
          const available = fs.readdirSync(archDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
          if (available.length > 0) {
            display.info(`Available: ${available.join(', ')}`);
          }
        }
      }
    }
  }

  // Substitute project info in config.yaml
  const configPath = path.join(workflowDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    let config = fs.readFileSync(configPath, 'utf-8');
    config = config.replace(/name: ""/, `name: "${project.name}"`);
    config = config.replace(/language: ""/, `language: "${project.language}"`);
    config = config.replace(/framework: ""/, `framework: "${project.framework}"`);
    config = config.replace(/architecture: none/, `architecture: ${architecture}`);
    config = config.replace(/lang_framework: ""/, `lang_framework: "${langFramework}"`);
    fs.writeFileSync(configPath, config, 'utf-8');
  }

  // Copy claude commands (rename sf.* to pxs.*)
  const claudeCommandsDir = path.join(TEMPLATES_DIR, 'claude-commands');
  const targetCommandsDir = path.join(cwd, '.claude', 'commands');
  if (fs.existsSync(claudeCommandsDir)) {
    const files = fs.readdirSync(claudeCommandsDir);
    for (const file of files) {
      const targetName = file.replace(/^sf\./, 'pxs.');
      fs.copyFileSync(
        path.join(claudeCommandsDir, file),
        path.join(targetCommandsDir, targetName)
      );
    }
  }

  // Append to AGENTS.md
  const agentsSnippetPath = path.join(TEMPLATES_DIR, 'agents-md-snippet.md');
  if (fs.existsSync(agentsSnippetPath)) {
    const snippet = fs.readFileSync(agentsSnippetPath, 'utf-8');
    const agentsPath = path.join(cwd, 'AGENTS.md');
    if (fs.existsSync(agentsPath)) {
      const existing = fs.readFileSync(agentsPath, 'utf-8');
      if (!existing.includes('SF Spec-Driven Workflow')) {
        fs.appendFileSync(agentsPath, '\n\n' + snippet, 'utf-8');
      }
    } else {
      fs.writeFileSync(agentsPath, snippet, 'utf-8');
    }
  }

  display.success('Created .workflow/ directory structure');
  display.success('Created .claude/commands/pxs.*.md slash commands');
  display.success('Created AGENTS.md');
  display.info('Run `pxs new <name>` to create your first spec.');
}

/**
 * Find the custom architecture file path from process.argv.
 * When user runs: pxs init --arch custom ./my-arch.md
 * Commander captures "custom" as --arch value, but the file path remains in argv.
 */
function findCustomArchPath(): string | undefined {
  const argv = process.argv;
  const archIdx = argv.findIndex((a) => a === '--arch');
  // The path should be 2 positions after --arch (--arch custom <path>)
  if (archIdx >= 0 && archIdx + 2 < argv.length) {
    const candidate = argv[archIdx + 2];
    if (candidate && !candidate.startsWith('-')) {
      return path.resolve(candidate);
    }
  }
  return undefined;
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
