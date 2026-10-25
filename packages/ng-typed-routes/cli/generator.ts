import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { analyzeRoutes } from './analyzer.js';
import { buildTree } from './tree.js';
import { emitTree } from './emit.js';

export interface GenerateOptions {
  /** Absolute path of the routes file. */
  routesFile: string;
  /** Absolute path of the output file. */
  outFile: string;
  /** Absolute path of the tsconfig used to resolve imports and types. */
  tsconfig: string;
  /** Exported variable holding the routes. Auto-detected when omitted. */
  exportName?: string;
  /** Name of the generated constant. Default `routes`. */
  constName?: string;
  /** Import specifier for the runtime. Default `ng-typed-routes`. */
  importFrom?: string;
}

export interface GenerateResult {
  code: string;
  warnings: string[];
  routeCount: number;
  /** All files that contributed routes (absolute paths). */
  files: string[];
}

/** Runs the whole pipeline in memory: parse → analyze → name → emit. */
export function generate(options: GenerateOptions): GenerateResult {
  const program = createProgram(options.routesFile, options.tsconfig);
  const analysis = analyzeRoutes(program, options.routesFile, options.exportName);
  const tree = buildTree(analysis.routes);
  const sourceLabel = toPosix(path.relative(path.dirname(options.outFile), options.routesFile));
  const code = emitTree(tree.root, {
    sourceLabel: sourceLabel.startsWith('.') ? sourceLabel : './' + sourceLabel,
    constName: options.constName,
    importFrom: options.importFrom,
  });
  return {
    code,
    warnings: [...analysis.warnings, ...tree.warnings],
    routeCount: tree.routeCount,
    files: analysis.files,
  };
}

export function createProgram(routesFile: string, tsconfig: string): ts.Program {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, host);
  if (!parsed) throw new Error(`Could not read tsconfig: ${tsconfig}`);
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
    incremental: false,
    composite: false,
    declaration: false,
    tsBuildInfoFile: undefined,
  };
  return ts.createProgram({ rootNames: [routesFile], options, projectReferences: parsed.projectReferences });
}

/** Writes `code` to `outFile` only when its content changed. Returns true if written. */
export function writeIfChanged(outFile: string, code: string): boolean {
  const normalized = code.replace(/\r\n/g, '\n');
  if (fs.existsSync(outFile)) {
    const current = fs.readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n');
    if (current === normalized) return false;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, normalized, 'utf8');
  return true;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
