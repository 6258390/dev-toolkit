import './patches.js';
const { input, select } = await import('@inquirer/prompts');
const { ListrInquirerPromptAdapter } = await import('@listr2/prompt-adapter-inquirer');
const { spawn: spawnProcess } = await import('child_process');
const { Command } = await import('commander');
const { mkdtemp, writeFile } = await import('fs/promises');
const { Listr } = await import('listr2');
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
          rendererOptions: options.verbose ? { logTitleChange: true } : { outputBar: Infinity, persistentOutput: true },
        });
        try {
          await fn(options, _createContext(listr, null, options));
          if (listr.tasks.length > 0) await listr.run();
        } catch { process.exit(1); }
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
      const isInherit = spawnOpts.stdio === 'inherit' || spawnOpts.stdio?.[1] === 'inherit';
      const proc = spawnProcess(cmd, args, { stdio: isInherit ? 'inherit' : ['inherit', 'pipe', 'pipe'], ...spawnOpts });

      // Inherit mode: simple exit handling
      if (isInherit) {
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Process exited with code ${code}`)));
        proc.on('error', (err) => reject(err));
        return;
      }

      // Pipe mode: full output capture and error logging
      let output = '';
      const lineHandler = onLine || (options.verbose ? (line) => { if (currentTask) currentTask.output = line; } : null);
      const handleData = (data) => {
        const text = data.toString();
        output += text;
        if (lineHandler) text.split('\n').filter(Boolean).forEach(line => lineHandler(line, resolve, reject));
      };
      if (proc.stdout) proc.stdout.on('data', handleData);
      if (proc.stderr) proc.stderr.on('data', handleData);
      proc.on('close', async (code) => {
        if (code !== 0) {
          const tmpFile = join(await mkdtemp(join(tmpdir(), 'spawn-error-')), 'error.log');
          await writeFile(tmpFile, output);
          setOutput([`code: ${code}`, `command: ${cmd} ${args.join(' ')}`, `cwd: ${spawnOpts.cwd || process.cwd()}`, `log_file: ${tmpFile}`]);
          reject(new Error(`Process exited with code ${code}`));
        } else if (!onLine) {resolve();}
      });
      proc.on('error', (err) => {
        setOutput([
          err.errno !== undefined && `errno: ${err.errno}`,
          err.code && `code: ${err.code}`,
          err.syscall && `syscall: ${err.syscall}`,
          err.path && `path: ${err.path}`,
          err.spawnargs && `spawnargs: [${err.spawnargs.join(', ')}]`,
        ].filter(Boolean));
        reject(new Error(err.message));
      });
    }),
    title: (newTitle) => { if (currentTask) currentTask.title = newTitle; },
    log: (message) => { if (currentTask) currentTask.output = message; },
    select: async (options) => {
      if (!currentTask) throw new Error('select() can only be called within a task');
      return currentTask.prompt(ListrInquirerPromptAdapter).run(select, options);
    },
    input: async (options) => {
      if (!currentTask) throw new Error('input() can only be called within a task');
      return currentTask.prompt(ListrInquirerPromptAdapter).run(input, options);
    },
    prompt: async (promptFn, options) => {
      if (!currentTask) throw new Error('prompt() can only be called within a task');
      return currentTask.prompt(ListrInquirerPromptAdapter).run(promptFn, options);
    },
  };
}
