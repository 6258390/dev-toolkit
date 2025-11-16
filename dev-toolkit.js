#!/usr/bin/env node
import { execSync } from 'child_process';
import { chmodSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { cli } from './index.js';

cli
  .command('lint')
  .description('Run linter on codebase')
  .option('--fix', 'Auto-fix linting errors')
  .action(async (options, ctx) => {
    await ctx.spawn('npx', ['eslint', '.', ...(options.fix ? ['--fix'] : [])], { stdio: 'inherit' });
  });

cli
  .command('bump')
  .description('Bump packages based on staged changes')
  .action(async (options, ctx) => {
    let stagedFiles = [];
    const templateNeedsBump = new Set();

    await ctx.task('Getting staged files', async () => {
      stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      for (const file of stagedFiles) {
        const match = file.match(/^templates\/([^/]+)\//);
        if (match) templateNeedsBump.add(match[1]);
      }
    });

    await ctx.parallel('Bumping packages', async (ctx) => {
      const packagesDir = join(process.cwd(), 'packages');
      if (!existsSync(packagesDir)) return;

      for (const pkgDir of readdirSync(packagesDir)) {
        const pkgPath = join(packagesDir, pkgDir);
        const pkgJsonPath = join(pkgPath, 'package.json');
        if (!existsSync(pkgJsonPath) || !stagedFiles.some(f => f.startsWith(`packages/${pkgDir}/`))) continue;

        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        await ctx.task(pkgJson.name, async (ctx) => {
          execSync('npm version patch --no-git-tag-version', { cwd: pkgPath, stdio: 'ignore' });
          execSync('git add package.json', { cwd: pkgPath });
          ctx.log(`📦 Bumped to ${JSON.parse(readFileSync(pkgJsonPath, 'utf-8')).version}`);

          const templatesDir = join(process.cwd(), 'templates');
          if (!existsSync(templatesDir)) return;

          for (const tpl of readdirSync(templatesDir)) {
            const tplPath = join(templatesDir, tpl);
            const tplJsonPath = join(tplPath, 'package.json');
            if (!existsSync(tplJsonPath)) continue;

            const tplJson = JSON.parse(readFileSync(tplJsonPath, 'utf-8'));
            if (tplJson.dependencies?.[pkgJson.name]) {
              execSync(`npm pkg set dependencies.${pkgJson.name}=^${JSON.parse(readFileSync(pkgJsonPath, 'utf-8')).version}`, { cwd: tplPath });
              templateNeedsBump.add(tpl);
              ctx.log(`📝 Synced ${tplJson.name}`);
            }
          }
        });
      }
    }, { skip: stagedFiles.length === 0 });

    await ctx.task('Bumping templates', async (ctx) => {
      const templatesDir = join(process.cwd(), 'templates');
      for (const tpl of templateNeedsBump) {
        const tplPath = join(templatesDir, tpl);
        const tplJsonPath = join(tplPath, 'package.json');
        if (!existsSync(tplJsonPath)) continue;

        const tplJson = JSON.parse(readFileSync(tplJsonPath, 'utf-8'));
        execSync('npm version patch --no-git-tag-version', { cwd: tplPath, stdio: 'ignore' });
        execSync('git add package.json', { cwd: tplPath });
        ctx.log(`📦 ${tplJson.name} → ${JSON.parse(readFileSync(tplJsonPath, 'utf-8')).version}`);
      }
    }, { skip: () => templateNeedsBump.size === 0 });
  });

cli
  .command('publish')
  .description('Publish packages and templates with version changes')
  .action(async (options, ctx) => {
    await ctx.task('Publishing packages', _publishFromDir('packages'));
    await ctx.task('Publishing templates', _publishFromDir('templates', true));

    // Implementation
    function _readJson(path) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }

    function _publishFromDir(dirName, renameGitignore = false) {
      return async (ctx) => {
        const dir = join(process.cwd(), dirName);
        if (!existsSync(dir)) return;

        for (const subDir of readdirSync(dir)) {
          const path = join(dir, subDir);
          const packageJsonPath = join(path, 'package.json');
          if (!existsSync(packageJsonPath)) continue;

          const hasVersionChange = execSync(`git diff HEAD~1 HEAD "${packageJsonPath}" | grep -q '^\\+.*"version"' && echo "yes" || echo "no"`, { encoding: 'utf-8', cwd: process.cwd() }).trim() === 'yes';
          if (!hasVersionChange) continue;

          const packageJson = _readJson(packageJsonPath);
          await ctx.task(packageJson.name, async (ctx) => {
            if (renameGitignore && existsSync(join(path, '.gitignore'))) execSync('mv .gitignore gitignore', { cwd: path });
            await ctx.spawn('npm', ['publish', '--access', 'public'], { cwd: path });
            if (renameGitignore && existsSync(join(path, 'gitignore'))) execSync('mv gitignore .gitignore', { cwd: path });
            ctx.log(`✅ Published ${packageJson.version}`);
          });
        }
      };
    }
  });

cli
  .command('init')
  .description('Initialize monorepo structure in current directory')
  .action(async (options, ctx) => {
    await ctx.task('Initializing git repository', async () => {
      await ctx.spawn('git', ['init']);
    });

    await ctx.task('Copying template files', async (ctx) => {
      const templateDir = join(dirname(fileURLToPath(import.meta.url)), 'templates');
      const targetDir = process.cwd();

      for (const item of readdirSync(templateDir)) {
        const sourcePath = join(templateDir, item);
        const targetName = item === 'gitignore' ? '.gitignore' : item;
        const targetPath = join(targetDir, targetName);
        cpSync(sourcePath, targetPath, { recursive: true });
      }

      ctx.log('✅ Copied all template files');
    });

    await ctx.task('Installing dependencies', async () => {
      await ctx.spawn('npm', ['install']);
    });
  });

cli
  .command('prepare')
  .description('Setup git hooks for monorepo')
  .action(async (options, ctx) => {
    await ctx.task('Creating pre-commit hook', async () => {
      writeFileSync('.git/hooks/pre-commit', `#!/usr/bin/env sh
[ -z "$(git diff --cached --name-only)" ] && exit 0

npm install
dev-toolkit lint --fix || exit 1
dev-toolkit bump
`);
      chmodSync('.git/hooks/pre-commit', 0o755);
    });
  });
