import type { Command } from 'commander';

export interface CLIContext {
  /** Add a task to the current list. */
  task(title: string, fn: (ctx: CLIContext) => void | Promise<void>, opts?: {
    /** Exit on error for this task. @default true */
    exitOnError?: boolean;
    /** Skip this task. */
    skip?: boolean | string | ((ctx: any) => boolean | string | Promise<boolean | string>);
    /** Retry configuration. */
    retry?: number | { tries: number; delay?: number };
    /** Rollback function when task fails. */
    rollback?: (ctx: any) => void | Promise<void>;
  }): Promise<void>;
  /** Add parallel tasks. */
  parallel(title: string, fn: (ctx: CLIContext) => void | Promise<void>): Promise<void>;
  /** Spawn a child process. */
  spawn(cmd: string, args?: string[], opts?: {
    /** Callback for each line of output. Can control when to resolve/reject. */
    onLine?: (line: string, resolve: () => void, reject: (err: Error) => void) => void;
    /** Current working directory of the child process. */
    cwd?: string;
  }): Promise<void>;
  /** Update current task title. */
  title(newTitle: string): void;
  /** Log message to current task output. */
  log(message: string): void;
}

/** Extended Command with CLIContext support. */
export interface CLICommand extends Command {
  action(fn: (options: any, ctx: CLIContext) => void | Promise<void>): this;
}

/** CLI instance with wrapped command method. */
export const cli: { command(name: string): CLICommand };
