# Code Style Rules

## 1. Single File
Create **one file** per feature/module.

## 2. Import Sorting
Sort imports alphabetically (a-z).
```js
import { Command } from 'commander';
import { Listr } from 'listr2';
import { spawn } from 'child_process';
```

## 3. Export Pattern
Use `export const name = _function` pattern.
```js
export const cli = _createCLI();
```

## 4. Implementation Comment
Add `// Implementation` comment before function definitions.
```js
export const cli = _createCLI();

// Implementation
function _createCLI() { ... }
```

## 5. Function Naming
Use underscore prefix for internal functions: `function _functionName() {}`
```js
function _createCLI() {}
function _createContext() {}
```

## 6. Helper Functions Placement
Place helper functions inside the scope where they're used, below usage with `// Implementation` comment.
```js
// Good - Helper functions inside scope
cli
  .command('publish')
  .action(async (options, ctx) => {
    // Usage first
    await ctx.task('Publishing packages', _publishFromDir('packages'));
    await ctx.task('Publishing templates', _publishFromDir('templates', true));

    // Implementation
    function _readJson(path) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }

    function _publishFromDir(dirName, renameGitignore = false) {
      return async (ctx) => { /* ... */ };
    }
  });

// Bad - Helper functions at top level
const _readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));
cli.command('publish').action(async (options, ctx) => {
  await ctx.task('Publishing packages', _publishFromDir('packages'));
});
```

## 7. Code Compression
- **One-liner**: Simple logic on single line
  ```js
  // Good
  if (currentTask) currentTask.output = line;

  // Bad
  if (currentTask) {
    currentTask.output = line;
  }
  ```

- **DRY**: Extract repeated code
  ```js
  // Good
  const handleData = (data) => { /* logic */ };
  proc.stdout.on('data', handleData);
  proc.stderr.on('data', handleData);

  // Bad
  proc.stdout.on('data', (data) => { /* logic */ });
  proc.stderr.on('data', (data) => { /* same logic */ });
  ```

- **Comment**: Add comments for complex logic only
  ```js
  // Collect stdout/stderr in order (mixed as they come)
  const handleData = (data) => { ... };
  ```

## 8. TypeScript Definition Files (.d.ts)

- **Inline simple types**: Inline option types directly into method signatures
  ```ts
  // Good - Inline
  spawn(cmd: string, args?: string[], opts?: {
    onLine?: (line: string, resolve: () => void, reject: (err: Error) => void) => void;
    cwd?: string;
  }): Promise<void>;

  // Bad - Separate interface for single use
  export interface SpawnOptions {
    onLine?: (line: string, resolve: () => void, reject: (err: Error) => void) => void;
    cwd?: string;
  }
  spawn(cmd: string, args?: string[], opts?: SpawnOptions): Promise<void>;
  ```

- **Keep reusable interfaces**: Don't inline main interfaces used across methods
  ```ts
  // Good - Keep interface
  export interface CLIContext {
    task(title: string, fn: (ctx: CLIContext) => void | Promise<void>): Promise<void>;
    parallel(title: string, fn: (ctx: CLIContext) => void | Promise<void>): Promise<void>;
  }
  ```

- **Preserve JSDoc comments**: Keep comments for IDE autocomplete tooltips
  ```ts
  export interface CLIContext {
    /** Add a task to the current list. */
    task(title: string, fn: (ctx: CLIContext) => void | Promise<void>): Promise<void>;
    /** Add parallel tasks. */
    parallel(title: string, fn: (ctx: CLIContext) => void | Promise<void>): Promise<void>;
  }
  ```