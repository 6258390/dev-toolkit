import './patches.js';
const { Command } = await import('commander');
const { Listr } = await import('listr2');
const { spawn: spawnProcess } = await import('child_process');
const { mkdtempSync, writeFileSync } = await import('fs');
const { tmpdir } = await import('os');
const { join } = await import('path');

export const cli = _createCLI();

// Implementation
function _createCLI() {
  const program = new Command();
  const originalCommand = program.command.bind(program);
  // Wrap command to inject ctx into action handler
  program.command = function(name, ...args) {
    const cmd = originalCommand(name, ...args);
    const originalAction = cmd.action.bind(cmd);
    cmd.action = function(fn) {
      return originalAction(async (...args) => {
        const options = args[0] || {};
        const listr = new Listr([], {
          concurrent: false,
          exitOnError: true,
          renderer: options.verbose ? 'verbose' : 'default',
          rendererOptions: options.verbose ? { logTitleChange: true } : { outputBar: Infinity, persistentOutput: true }
        });
        try {
          await fn(options, _createContext(listr, null, options));
          if (listr.tasks.length > 0) await listr.run();
        } catch (err) { process.exit(1); }
      });
    };
    return cmd;
  };
  process.nextTick(() => program.parse());
  return program;
}

function _createContext(listr, currentTask, options) {
  // Renderer options only for default renderer
  const rendererOpts = options.verbose ? {} : { outputBar: Infinity, persistentOutput: true };
  const setOutput = (details) => { if (currentTask) currentTask.output = details.join('\n'); };
  return {
    task: async (title, fn, opts = {}) => {
      listr.add({ title, task: async (ctx, task) => {
        // Check fn.length to detect nested tasks (fn accepts ctx parameter)
        if (fn.length > 0) {
          const sub = task.newListr([], { concurrent: false, exitOnError: true });
          await fn(_createContext(sub, task, options));
          return sub;
        }
        await fn();
      }, rendererOptions: rendererOpts, ...opts });
    },
    parallel: async (title, fn) => {
      listr.add({ title, task: async (ctx, task) => {
        const sub = task.newListr([], { concurrent: true, exitOnError: true });
        await fn(_createContext(sub, task, options));
        return sub;
      }, rendererOptions: rendererOpts });
    },
    spawn: async (cmd, args = [], opts = {}) => new Promise((resolve, reject) => {
      const { onLine, ...spawnOpts } = opts;
      const proc = spawnProcess(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], ...spawnOpts });
      let output = '';
      // Line handler: onLine callback or auto-pipe to task output in verbose mode
      const lineHandler = onLine || (options.verbose ? (line) => { if (currentTask) currentTask.output = line; } : null);
      // Collect stdout/stderr in order (mixed as they come)
      const handleData = (data) => {
        const text = data.toString();
        output += text;
        if (lineHandler) text.split('\n').filter(Boolean).forEach(line => lineHandler(line, resolve, reject));
      };
      if (proc.stdout) proc.stdout.on('data', handleData);
      if (proc.stderr) proc.stderr.on('data', handleData);
      // Exit handling: write to tmp file on failure, auto-resolve on success without onLine
      proc.on('close', (code) => {
        if (code !== 0) {
          const tmpFile = join(mkdtempSync(join(tmpdir(), 'spawn-error-')), 'error.log');
          writeFileSync(tmpFile, output);
          setOutput([`code: ${code}`, `command: ${cmd} ${args.join(' ')}`, `cwd: ${spawnOpts.cwd || process.cwd()}`, `log_file: ${tmpFile}`]);
          reject(new Error(`Process exited with code ${code}`));
        } else if (!onLine) resolve();
      });
      // Spawn errors (ENOENT, etc): show error details without tmp file
      proc.on('error', (err) => {
        setOutput([
          err.errno !== undefined && `errno: ${err.errno}`,
          err.code && `code: ${err.code}`,
          err.syscall && `syscall: ${err.syscall}`,
          err.path && `path: ${err.path}`,
          err.spawnargs && `spawnargs: [${err.spawnargs.join(', ')}]`
        ].filter(Boolean));
        reject(new Error(err.message));
      });
    }),
    title: (newTitle) => { if (currentTask) currentTask.title = newTitle; },
    log: (message) => { if (currentTask) currentTask.output = message; }
  };
}
