import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectProject } from '../../src/discovery/project.js';

describe('detectProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-proj-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Node.js project from package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@my/app' })
    );
    const info = detectProject(tmpDir);
    expect(info.language).toBe('typescript');
    expect(info.framework).toBe('node');
    expect(info.name).toBe('@my/app');
  });

  it('detects Go project from go.mod', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'go.mod'),
      'module github.com/user/myapp\n\ngo 1.21\n'
    );
    const info = detectProject(tmpDir);
    expect(info.language).toBe('go');
    expect(info.name).toBe('github.com/user/myapp');
  });

  it('detects C# project from .csproj', () => {
    fs.writeFileSync(path.join(tmpDir, 'MyApp.csproj'), '<Project></Project>');
    const info = detectProject(tmpDir);
    expect(info.language).toBe('csharp');
    expect(info.framework).toBe('dotnet');
    expect(info.name).toBe('MyApp');
  });

  it('returns defaults for unknown project', () => {
    const info = detectProject(tmpDir);
    expect(info.language).toBe('');
    expect(info.framework).toBe('');
    expect(info.lang_framework).toBe('');
    expect(info.name).toBe(path.basename(tmpDir));
  });

  // lang_framework detection tests
  describe('lang_framework detection', () => {
    it('detects typescript-nestjs from @nestjs/core dependency', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { '@nestjs/core': '^10.0.0' } })
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('typescript-nestjs');
    });

    it('detects typescript-express from express dependency', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { express: '^4.18.0' } })
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('typescript-express');
    });

    it('defaults to typescript-express for generic Node.js project', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app' })
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('typescript-express');
    });

    it('detects go-gin from gin dependency in go.mod', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'go.mod'),
        'module github.com/user/app\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.1\n'
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('go-gin');
    });

    it('detects go-chi from chi dependency in go.mod', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'go.mod'),
        'module github.com/user/app\n\ngo 1.21\n\nrequire github.com/go-chi/chi v5.0.0\n'
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('go-chi');
    });

    it('defaults to go-std for generic Go project', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'go.mod'),
        'module github.com/user/app\n\ngo 1.21\n'
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('go-std');
    });

    it('detects python-fastapi from requirements.txt', () => {
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('python-fastapi');
    });

    it('detects python-django from requirements.txt', () => {
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'django==4.2\ngunicorn\n');
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('python-django');
    });

    it('detects csharp-aspnet from .csproj', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'MyApp.csproj'),
        '<Project><ItemGroup><PackageReference Include="Microsoft.AspNetCore" /></ItemGroup></Project>'
      );
      const info = detectProject(tmpDir);
      expect(info.lang_framework).toBe('csharp-aspnet');
    });

    it('detects dart-flutter from pubspec.yaml with flutter SDK', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'pubspec.yaml'),
        'name: my_flutter_app\n\ndependencies:\n  flutter:\n    sdk: flutter\n'
      );
      const info = detectProject(tmpDir);
      expect(info.language).toBe('dart');
      expect(info.framework).toBe('flutter');
      expect(info.lang_framework).toBe('dart-flutter');
      expect(info.name).toBe('my_flutter_app');
    });

    it('detects swift-ios from .xcodeproj directory', () => {
      fs.mkdirSync(path.join(tmpDir, 'MyApp.xcodeproj'));
      const info = detectProject(tmpDir);
      expect(info.language).toBe('swift');
      expect(info.framework).toBe('ios');
      expect(info.lang_framework).toBe('swift-ios');
      expect(info.name).toBe('MyApp');
    });

    it('detects kotlin-android from build.gradle.kts with android plugin', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'build.gradle.kts'),
        'plugins {\n    id("com.android.application")\n    id("org.jetbrains.kotlin.android")\n}\n'
      );
      const info = detectProject(tmpDir);
      expect(info.language).toBe('kotlin');
      expect(info.framework).toBe('android');
      expect(info.lang_framework).toBe('kotlin-android');
    });
  });
});
