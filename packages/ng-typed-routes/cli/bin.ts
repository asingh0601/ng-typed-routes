#!/usr/bin/env node
import { createRequire } from 'node:module';
import { HELP, parseArgs, resolveOptions } from './config.js';
import { runCheck, runGenerate, runWatch, type Logger } from './commands.js';

async function main(argv: string[]): Promise<number> {
  const { command, flags } = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (flags.version) {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version: string };
    process.stdout.write(pkg.version + '\n');
    return 0;
  }
  const log: Logger = {
    info: (m) => {
      if (!flags.quiet && !flags.stdout) console.log(m);
    },
    warn: (m) => {
      if (!flags.stdout) console.warn(m);
      else console.error(m);
    },
    error: (m) => console.error(m),
  };
  const options = resolveOptions(process.cwd(), flags);
  switch (command) {
    case 'check':
      return runCheck(options, log);
    case 'watch':
      return runWatch(options, log);
    default:
      return runGenerate(options, log, flags.stdout === true);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(`ng-typed-routes: ${(e as Error).message}`);
    process.exitCode = 1;
  },
);
