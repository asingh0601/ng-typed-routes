import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GenerateOptions } from './generator.js';

export const CONFIG_FILE = 'ng-typed-routes.config.json';

export interface CliFlags {
  routes?: string;
  out?: string;
  tsconfig?: string;
  export?: string;
  name?: string;
  importFrom?: string;
  stdout?: boolean;
  quiet?: boolean;
  help?: boolean;
  version?: boolean;
}

export interface ParsedArgs {
  command: 'generate' | 'watch' | 'check';
  flags: CliFlags;
}

const STRING_FLAGS: Record<string, keyof CliFlags> = {
  '--routes': 'routes',
  '-r': 'routes',
  '--out': 'out',
  '-o': 'out',
  '--tsconfig': 'tsconfig',
  '-p': 'tsconfig',
  '--export': 'export',
  '-e': 'export',
  '--name': 'name',
  '--import-from': 'importFrom',
};

const BOOLEAN_FLAGS: Record<string, keyof CliFlags> = {
  '--stdout': 'stdout',
  '--quiet': 'quiet',
  '-q': 'quiet',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

export function parseArgs(argv: string[]): ParsedArgs {
  let command: ParsedArgs['command'] = 'generate';
  const flags: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'generate' || arg === 'watch' || arg === 'check') {
      command = arg;
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq > 0 ? arg.slice(0, eq) : arg;
    if (key in STRING_FLAGS) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined) throw new Error(`Flag ${key} needs a value.`);
      (flags as Record<string, unknown>)[STRING_FLAGS[key]] = value;
      continue;
    }
    if (key in BOOLEAN_FLAGS) {
      (flags as Record<string, unknown>)[BOOLEAN_FLAGS[key]] = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`);
  }
  return { command, flags };
}

export interface FileConfig {
  routes?: string;
  out?: string;
  tsconfig?: string;
  export?: string;
  name?: string;
  importFrom?: string;
}

export function readFileConfig(cwd: string): FileConfig {
  const file = path.join(cwd, CONFIG_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as FileConfig;
  } catch (e) {
    throw new Error(`Could not parse ${CONFIG_FILE}: ${(e as Error).message}`);
  }
}

/** Merges flags, config file and defaults into absolute generator options. */
export function resolveOptions(cwd: string, flags: CliFlags): GenerateOptions {
  const file = readFileConfig(cwd);
  const routesRel = flags.routes ?? file.routes ?? findRoutesFile(cwd);
  if (!routesRel) {
    throw new Error(
      `Could not find a routes file. Expected src/app/app.routes.ts; pass --routes <file> or create ${CONFIG_FILE}.`,
    );
  }
  const routesFile = path.resolve(cwd, routesRel);
  if (!fs.existsSync(routesFile)) throw new Error(`Routes file not found: ${routesFile}`);

  const outFile = path.resolve(cwd, flags.out ?? file.out ?? path.join(path.dirname(routesFile), 'routes.gen.ts'));
  const tsconfig = path.resolve(cwd, flags.tsconfig ?? file.tsconfig ?? findTsconfig(path.dirname(routesFile), cwd));
  if (!fs.existsSync(tsconfig)) throw new Error(`tsconfig not found: ${tsconfig}`);

  return {
    routesFile,
    outFile,
    tsconfig,
    exportName: flags.export ?? file.export,
    constName: flags.name ?? file.name,
    importFrom: flags.importFrom ?? file.importFrom,
  };
}

function findRoutesFile(cwd: string): string | undefined {
  const conventional = path.join('src', 'app', 'app.routes.ts');
  if (fs.existsSync(path.join(cwd, conventional))) return conventional;
  const src = path.join(cwd, 'src');
  if (!fs.existsSync(src)) return undefined;
  const found = walk(src, (f) => /(^|[\\/])app\.routes\.ts$/.test(f), 6);
  return found ? path.relative(cwd, found) : undefined;
}

function walk(dir: string, match: (file: string) => boolean, depth: number): string | undefined {
  if (depth < 0) return undefined;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && match(full)) return full;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      const found = walk(path.join(dir, entry.name), match, depth - 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Nearest tsconfig.app.json, else tsconfig.json, walking up from `start` to `stop`. */
function findTsconfig(start: string, stop: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === stop) break;
    dir = parent;
  }
  return path.join(stop, 'tsconfig.json');
}

export const HELP = `ng-typed-routes — type-safe routing for Angular, generated from your routes file

Usage:
  ng-typed-routes [generate] [options]   Generate routes.gen.ts (default)
  ng-typed-routes watch [options]        Regenerate whenever a source file changes
  ng-typed-routes check [options]        Exit 1 if routes.gen.ts is missing or stale (for CI)

Options:
  -r, --routes <file>     Routes file          (default: src/app/app.routes.ts)
  -o, --out <file>        Output file          (default: <routes dir>/routes.gen.ts)
  -p, --tsconfig <file>   tsconfig to use      (default: nearest tsconfig.app.json or tsconfig.json)
  -e, --export <name>     Exported routes variable (default: auto-detect)
      --name <name>       Name of the generated constant (default: routes)
      --import-from <id>  Module to import route()/meta() from (default: ng-typed-routes)
      --stdout            Print the generated code instead of writing it
  -q, --quiet             Only print errors
  -h, --help              Show this help
  -v, --version           Show the version

Configuration can also live in ${CONFIG_FILE} next to package.json:
  { "routes": "src/app/app.routes.ts", "out": "src/app/routes.gen.ts" }
`;
