import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { SchematicsException, type Rule, type SchematicContext, type Tree, chain } from '@angular-devkit/schematics';

export interface NgAddOptions {
  project?: string;
  routes?: string;
  out?: string;
  skipGenerate?: boolean;
}

interface WorkspaceProject {
  projectType?: string;
  root?: string;
  sourceRoot?: string;
  architect?: Record<string, { options?: Record<string, unknown> }>;
}

interface Workspace {
  projects?: Record<string, WorkspaceProject>;
}

interface Resolved {
  projectName: string;
  projectRoot: string;
  routes: string;
  out: string;
  tsconfig: string;
}

export function ngAdd(options: NgAddOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const resolved = resolvePaths(tree, options);
    context.logger.info(`ng-typed-routes: routes file ${resolved.routes}, output ${resolved.out}`);
    return chain([
      addScripts(resolved),
      addConfigIfNeeded(resolved),
      addPrettierIgnore(resolved),
      options.skipGenerate ? noop() : generateFirstFile(resolved),
    ]);
  };
}

function noop(): Rule {
  return (tree) => tree;
}

function resolvePaths(tree: Tree, options: NgAddOptions): Resolved {
  const raw = tree.read('angular.json');
  if (!raw) throw new SchematicsException('angular.json not found. Run `ng add ng-typed-routes` in an Angular workspace.');
  const workspace = JSON.parse(stripJsonComments(raw.toString('utf8'))) as Workspace;
  const projects = workspace.projects ?? {};
  let projectName = options.project;
  if (!projectName) {
    projectName = Object.keys(projects).find((name) => projects[name].projectType === 'application') ?? Object.keys(projects)[0];
  }
  if (!projectName || !projects[projectName]) {
    throw new SchematicsException(`Project '${options.project ?? ''}' not found in angular.json.`);
  }
  const project = projects[projectName];
  const projectRoot = project.root ?? '';
  const sourceRoot = project.sourceRoot ?? posix(projectRoot, 'src');

  const routes = options.routes ?? findRoutesFile(tree, sourceRoot);
  if (!tree.exists(routes)) {
    throw new SchematicsException(`Routes file not found: ${routes}. Pass --routes <path>.`);
  }
  const out = options.out ?? posix(path.posix.dirname(routes), 'routes.gen.ts');
  const buildTsConfig = project.architect?.['build']?.options?.['tsConfig'];
  const tsconfig =
    typeof buildTsConfig === 'string' && tree.exists(buildTsConfig)
      ? buildTsConfig
      : tree.exists(posix(projectRoot, 'tsconfig.app.json'))
        ? posix(projectRoot, 'tsconfig.app.json')
        : 'tsconfig.json';
  return { projectName, projectRoot, routes, out, tsconfig };
}

function findRoutesFile(tree: Tree, sourceRoot: string): string {
  const conventional = posix(sourceRoot, 'app', 'app.routes.ts');
  if (tree.exists(conventional)) return conventional;
  let found: string | undefined;
  tree.getDir(sourceRoot).visit((filePath) => {
    if (!found && filePath.endsWith('app.routes.ts')) found = filePath.replace(/^\//, '');
  });
  return found ?? conventional;
}

function addScripts(resolved: Resolved): Rule {
  return (tree, context) => {
    const pkgPath = 'package.json';
    const raw = tree.read(pkgPath);
    if (!raw) return tree;
    const pkg = JSON.parse(raw.toString('utf8')) as { scripts?: Record<string, string> };
    pkg.scripts ??= {};
    const scripts: Record<string, string> = {
      'routes:generate': 'ng-typed-routes generate',
      'routes:watch': 'ng-typed-routes watch',
      'routes:check': 'ng-typed-routes check',
    };
    let changed = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (!pkg.scripts[name]) {
        pkg.scripts[name] = command;
        changed = true;
      }
    }
    if (changed) {
      tree.overwrite(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      context.logger.info('ng-typed-routes: added npm scripts routes:generate, routes:watch, routes:check');
    }
    void resolved;
    return tree;
  };
}

/** Writes ng-typed-routes.config.json only when the defaults would not find the files. */
function addConfigIfNeeded(resolved: Resolved): Rule {
  return (tree) => {
    const defaultRoutes = 'src/app/app.routes.ts';
    const defaultOut = 'src/app/routes.gen.ts';
    const defaultTsconfig = 'tsconfig.app.json';
    const needsConfig = resolved.routes !== defaultRoutes || resolved.out !== defaultOut || resolved.tsconfig !== defaultTsconfig;
    if (!needsConfig || tree.exists('ng-typed-routes.config.json')) return tree;
    tree.create(
      'ng-typed-routes.config.json',
      JSON.stringify({ routes: resolved.routes, out: resolved.out, tsconfig: resolved.tsconfig }, null, 2) + '\n',
    );
    return tree;
  };
}

function addPrettierIgnore(resolved: Resolved): Rule {
  return (tree) => {
    const file = '.prettierignore';
    if (!tree.exists(file)) return tree;
    const content = tree.read(file)!.toString('utf8');
    if (content.split(/\r?\n/).some((line) => line.trim() === resolved.out || line.trim() === '**/routes.gen.ts')) return tree;
    tree.overwrite(file, content.replace(/\s*$/, '') + `\n${resolved.out}\n`);
    return tree;
  };
}

function generateFirstFile(resolved: Resolved): Rule {
  return (tree, context) => {
    const bin = path.join(__dirname, '..', '..', 'cli', 'bin.js');
    const result = spawnSync(
      process.execPath,
      [bin, 'generate', '--routes', resolved.routes, '--out', resolved.out, '--tsconfig', resolved.tsconfig, '--stdout'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    if (result.status !== 0 || !result.stdout) {
      context.logger.warn(`ng-typed-routes: first generation failed, run 'npm run routes:generate' manually.\n${result.stderr}`);
      return tree;
    }
    if (result.stderr.trim()) context.logger.warn(result.stderr.trim());
    if (tree.exists(resolved.out)) tree.overwrite(resolved.out, result.stdout);
    else tree.create(resolved.out, result.stdout);
    context.logger.info(`ng-typed-routes: generated ${resolved.out}`);
    return tree;
  };
}

function posix(...parts: string[]): string {
  return path.posix.join(...parts.filter((p) => p.length > 0));
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
