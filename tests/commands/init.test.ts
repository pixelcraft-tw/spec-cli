import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('resolveLangFramework', () => {
  it('resolves shorthand language names', async () => {
    const { resolveLangFramework } = await import('../../src/commands/init.js');
    expect(resolveLangFramework('go')).toBe('go-std');
    expect(resolveLangFramework('typescript')).toBe('typescript-express');
    expect(resolveLangFramework('ts')).toBe('typescript-express');
    expect(resolveLangFramework('csharp')).toBe('csharp-aspnet');
    expect(resolveLangFramework('python')).toBe('python-fastapi');
    expect(resolveLangFramework('gin')).toBe('go-gin');
    expect(resolveLangFramework('nestjs')).toBe('typescript-nestjs');
    expect(resolveLangFramework('flutter')).toBe('dart-flutter');
    expect(resolveLangFramework('dart')).toBe('dart-flutter');
    expect(resolveLangFramework('ios')).toBe('swift-ios');
    expect(resolveLangFramework('swift')).toBe('swift-ios');
    expect(resolveLangFramework('android')).toBe('kotlin-android');
    expect(resolveLangFramework('kotlin')).toBe('kotlin-android');
  });

  it('passes through full lang_framework IDs unchanged', async () => {
    const { resolveLangFramework } = await import('../../src/commands/init.js');
    expect(resolveLangFramework('go-gin')).toBe('go-gin');
    expect(resolveLangFramework('typescript-nestjs')).toBe('typescript-nestjs');
    expect(resolveLangFramework('python-fastapi')).toBe('python-fastapi');
  });

  it('passes through unknown values unchanged', async () => {
    const { resolveLangFramework } = await import('../../src/commands/init.js');
    expect(resolveLangFramework('ruby-rails')).toBe('ruby-rails');
  });

  it('is case-insensitive', async () => {
    const { resolveLangFramework } = await import('../../src/commands/init.js');
    expect(resolveLangFramework('Go')).toBe('go-std');
    expect(resolveLangFramework('TypeScript')).toBe('typescript-express');
  });
});

// We test the init logic indirectly by checking file creation
describe('pxs init', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-init-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    // Create a package.json so project detection works
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .workflow directory structure', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false });

    expect(fs.existsSync(path.join(tmpDir, '.workflow'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.workflow', 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.workflow', 'prompts', 'clarify.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.workflow', 'prompts', 'refine.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.workflow', 'prompts', 'implement.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.workflow', 'templates', 'spec-template.md'))).toBe(true);
  });

  it('creates claude commands', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false });

    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    expect(fs.existsSync(commandsDir)).toBe(true);
    // Files should be renamed from sf.* to pxs.*
    expect(fs.existsSync(path.join(commandsDir, 'pxs.new.md'))).toBe(true);
    expect(fs.existsSync(path.join(commandsDir, 'pxs.refine.md'))).toBe(true);
  });

  it('creates AGENTS.md', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false });

    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('SF Spec-Driven Workflow');
  });

  it('populates config with detected project info', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false });

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('name: "test-project"');
    expect(config).toContain('language: "typescript"');
  });

  it('populates config with architecture and lang_framework defaults', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false });

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('architecture: none');
    expect(config).toContain('lang_framework: "typescript-express"');
  });

  it('creates architecture.md with --arch clean', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'typescript-nestjs' });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(true);
    const content = fs.readFileSync(archPath, 'utf-8');
    expect(content).toContain('Clean Architecture');
    expect(content).toContain('NestJS');
  });

  it('sets architecture in config.yaml with --arch', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'go-gin' });

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('architecture: clean');
    expect(config).toContain('lang_framework: "go-gin"');
  });

  it('does not create architecture.md without --arch', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(false);
  });

  it('warns when architecture template not found', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'ruby-rails' });

    // architecture.md should not exist since template was not found
    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(false);
  });

  it('resolves --lang go shorthand to go-std', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'go' });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(true);

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('lang_framework: "go-std"');
  });

  it('resolves --lang typescript shorthand to typescript-express', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'typescript' });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(true);

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('lang_framework: "typescript-express"');
  });

  it('resolves --lang gin shorthand to go-gin', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'gin' });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(true);

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('lang_framework: "go-gin"');
  });

  it('still accepts full lang_framework IDs', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean', lang: 'go-gin' });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(true);

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('lang_framework: "go-gin"');
  });

  it('uses auto-detected lang_framework when --lang not provided', async () => {
    // package.json with @nestjs/core
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'nest-app', dependencies: { '@nestjs/core': '^10.0.0' } })
    );

    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ force: false, arch: 'clean' });

    const archPath = path.join(tmpDir, '.workflow', 'architecture.md');
    expect(fs.existsSync(archPath)).toBe(true);
    const content = fs.readFileSync(archPath, 'utf-8');
    expect(content).toContain('NestJS');

    const config = fs.readFileSync(path.join(tmpDir, '.workflow', 'config.yaml'), 'utf-8');
    expect(config).toContain('lang_framework: "typescript-nestjs"');
  });
});
