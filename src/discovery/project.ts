import fs from 'node:fs';
import path from 'node:path';

export interface ProjectInfo {
  name: string;
  language: string;
  framework: string;
  lang_framework: string;
}

export function detectProject(cwd: string = process.cwd()): ProjectInfo {
  const info: ProjectInfo = {
    name: path.basename(cwd),
    language: '',
    framework: '',
    lang_framework: '',
  };

  // Flutter (must come before Node.js — Flutter uses pubspec.yaml, not package.json)
  const pubspecPath = path.join(cwd, 'pubspec.yaml');
  if (fs.existsSync(pubspecPath)) {
    const content = fs.readFileSync(pubspecPath, 'utf-8');
    if (content.includes('flutter:') || content.includes('sdk: flutter')) {
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      if (nameMatch) {
        info.name = nameMatch[1].trim();
      }
      info.language = 'dart';
      info.framework = 'flutter';
      info.lang_framework = 'dart-flutter';
      return info;
    }
  }

  // Node.js / TypeScript
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      info.name = pkg.name || info.name;
      info.language = 'typescript';
      info.framework = 'node';
      info.lang_framework = detectNodeFramework(pkg);
    } catch {
      // ignore parse error
    }
    return info;
  }

  // Go
  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    const content = fs.readFileSync(goModPath, 'utf-8');
    const moduleMatch = content.match(/^module\s+(.+)$/m);
    if (moduleMatch) {
      info.name = moduleMatch[1].trim();
    }
    info.language = 'go';
    info.framework = 'go';
    info.lang_framework = detectGoFramework(content);
    return info;
  }

  // Python
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    const content = fs.readFileSync(reqPath, 'utf-8');
    info.language = 'python';
    info.framework = 'python';
    info.lang_framework = detectPythonFramework(content);
    return info;
  }

  // C# / .NET
  const csprojFiles = fs.readdirSync(cwd).filter((f) => f.endsWith('.csproj'));
  if (csprojFiles.length > 0) {
    info.name = csprojFiles[0].replace('.csproj', '');
    info.language = 'csharp';
    info.framework = 'dotnet';
    const content = fs.readFileSync(path.join(cwd, csprojFiles[0]), 'utf-8');
    info.lang_framework = detectCsharpFramework(content);
    return info;
  }

  // iOS (*.xcodeproj directory at root)
  const entries = fs.readdirSync(cwd);
  const xcodeprojDir = entries.find((e) => e.endsWith('.xcodeproj'));
  if (xcodeprojDir) {
    const stat = fs.statSync(path.join(cwd, xcodeprojDir));
    if (stat.isDirectory()) {
      info.name = xcodeprojDir.replace('.xcodeproj', '');
      info.language = 'swift';
      info.framework = 'ios';
      info.lang_framework = 'swift-ios';
      return info;
    }
  }

  // Android (build.gradle.kts or build.gradle with android plugin)
  const gradleKts = path.join(cwd, 'build.gradle.kts');
  const gradleGroovy = path.join(cwd, 'build.gradle');
  const gradlePath = fs.existsSync(gradleKts) ? gradleKts : fs.existsSync(gradleGroovy) ? gradleGroovy : null;
  if (gradlePath) {
    const content = fs.readFileSync(gradlePath, 'utf-8');
    if (content.includes('com.android.application') || content.includes('com.android.library')) {
      const nameMatch = content.match(/namespace\s*=?\s*["']([^"']+)["']/);
      if (nameMatch) {
        info.name = nameMatch[1].split('.').pop() || info.name;
      }
      info.language = 'kotlin';
      info.framework = 'android';
      info.lang_framework = 'kotlin-android';
      return info;
    }
  }

  return info;
}

function detectNodeFramework(pkg: Record<string, unknown>): string {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  if (deps['@nestjs/core']) return 'typescript-nestjs';
  if (deps['express']) return 'typescript-express';

  return 'typescript-express';
}

function detectGoFramework(goMod: string): string {
  if (goMod.includes('github.com/gin-gonic/gin')) return 'go-gin';
  if (goMod.includes('github.com/go-chi/chi')) return 'go-chi';

  return 'go-std';
}

function detectPythonFramework(requirements: string): string {
  const lower = requirements.toLowerCase();
  if (lower.includes('fastapi')) return 'python-fastapi';
  if (lower.includes('django')) return 'python-django';

  return 'python-std';
}

function detectCsharpFramework(csproj: string): string {
  if (csproj.includes('Microsoft.AspNetCore')) return 'csharp-aspnet';

  return 'csharp-dotnet';
}
