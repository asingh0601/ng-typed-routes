import * as fs from 'node:fs';
import * as path from 'node:path';
import { generate, writeIfChanged, toPosix, type GenerateOptions } from './generator.js';
import { normalizeForCompare } from './emit.js';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function runGenerate(options: GenerateOptions, log: Logger, stdout = false): number {
  const started = Date.now();
  const result = generate(options);
  for (const w of result.warnings) log.warn(`warning: ${w}`);
  if (stdout) {
    process.stdout.write(result.code);
    return 0;
  }
  const written = writeIfChanged(options.outFile, result.code);
  const rel = toPosix(path.relative(process.cwd(), options.outFile));
  log.info(
    `${written ? 'Wrote' : 'Up to date:'} ${rel} (${result.routeCount} route${result.routeCount === 1 ? '' : 's'}, ${Date.now() - started}ms)`,
  );
  return 0;
}

export function runCheck(options: GenerateOptions, log: Logger): number {
  const result = generate(options);
  for (const w of result.warnings) log.warn(`warning: ${w}`);
  const rel = toPosix(path.relative(process.cwd(), options.outFile));
  if (!fs.existsSync(options.outFile)) {
    log.error(`${rel} does not exist. Run 'ng-typed-routes generate' and commit the result.`);
    return 1;
  }
  const current = fs.readFileSync(options.outFile, 'utf8');
  if (normalizeForCompare(current) !== normalizeForCompare(result.code)) {
    log.error(`${rel} is stale. Run 'ng-typed-routes generate' and commit the result.`);
    return 1;
  }
  log.info(`${rel} is up to date (${result.routeCount} routes).`);
  return 0;
}

export function runWatch(options: GenerateOptions, log: Logger): Promise<never> {
  let files = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const outFile = path.resolve(options.outFile);

  const regenerate = () => {
    try {
      const result = generate(options);
      files = new Set(result.files.map((f) => path.resolve(f)));
      for (const w of result.warnings) log.warn(`warning: ${w}`);
      const written = writeIfChanged(options.outFile, result.code);
      const rel = toPosix(path.relative(process.cwd(), options.outFile));
      log.info(`${new Date().toLocaleTimeString()} ${written ? 'Wrote' : 'Up to date:'} ${rel} (${result.routeCount} routes)`);
    } catch (e) {
      log.error(`error: ${(e as Error).message}`);
    }
  };

  regenerate();

  const watchRoot = findWatchRoot(options.routesFile);
  log.info(`Watching ${toPosix(path.relative(process.cwd(), watchRoot)) || '.'} for changes...`);
  fs.watch(watchRoot, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const full = path.resolve(watchRoot, filename.toString());
    if (full === outFile) return;
    if (!/\.(m|c)?ts$/.test(full)) return;
    // Regenerate for contributing files and for any new/renamed .ts file (it might be a new routes module).
    if (!files.has(full) && fs.existsSync(full) && !/routes/i.test(full)) return;
    clearTimeout(timer);
    timer = setTimeout(regenerate, 150);
  });

  return new Promise<never>(() => {
    /* keep the process alive */
  });
}

/** Watches the nearest `src` directory above the routes file, or its own directory. */
function findWatchRoot(routesFile: string): string {
  let dir = path.dirname(routesFile);
  for (let i = 0; i < 8; i++) {
    if (path.basename(dir) === 'src') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(routesFile);
}
