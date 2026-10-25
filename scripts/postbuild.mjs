// Finalizes packages/ng-typed-routes/dist after ng-packagr, tsc (cli) and tsc (schematics) ran.
// - points `bin` and `schematics` at their dist locations
// - drops dev-only fields
// - marks dist/schematics as CommonJS (ng-packagr sets "type": "module" on the package)
// - copies LICENSE and README
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pkgRoot = join(repoRoot, 'packages', 'ng-typed-routes');
const dist = join(pkgRoot, 'dist');

const pkgPath = join(dist, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

pkg.bin = { 'ng-typed-routes': './cli/bin.js' };
pkg.schematics = './schematics/collection.json';
pkg['ng-add'] = { save: 'dependencies' };
pkg.engines = { node: '>=20.11' };
delete pkg.files;
delete pkg.publishConfig;
delete pkg.scripts;
delete pkg.devDependencies;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

mkdirSync(join(dist, 'schematics'), { recursive: true });
writeFileSync(join(dist, 'schematics', 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
copyFileSync(join(pkgRoot, 'schematics', 'collection.json'), join(dist, 'schematics', 'collection.json'));
copyFileSync(join(pkgRoot, 'schematics', 'ng-add', 'schema.json'), join(dist, 'schematics', 'ng-add', 'schema.json'));

for (const file of ['LICENSE', 'README.md']) {
  const src = join(repoRoot, file);
  if (existsSync(src)) copyFileSync(src, join(dist, file));
}

const bin = join(dist, 'cli', 'bin.js');
if (existsSync(bin)) {
  try {
    chmodSync(bin, 0o755);
  } catch {
    // Windows: no-op
  }
}

console.log('postbuild: dist/package.json finalized');
