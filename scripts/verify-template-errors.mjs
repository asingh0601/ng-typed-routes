// Proves the "broken link is a compile error" promise on the demo app.
// Adds a component with deliberate mistakes, type-checks the app with the Angular
// compiler (templates included), asserts every mistake is reported, then cleans up.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const demo = resolve(here, '..', 'examples', 'demo-app');
const brokenFile = join(demo, 'src', 'app', '__broken__.ts');
const tsconfig = join(demo, 'tsconfig.verify.json');

const broken = `import { Component } from '@angular/core';
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  imports: [TypedLinkDirective],
  template: \`
    <a [typedLink]="routes.users.detail">missing params</a>
    <a [typedLink]="routes.users.detail" [params]="{ idd: 1 }">wrong param name</a>
    <a [typedLink]="routes.users.detail" [params]="{ id: true }">wrong param type</a>
    <a [typedLink]="routes.users.detail.orders" [params]="{ id: 1 }" [query]="{ status: 'lost' }">wrong query value</a>
    <a [typedLink]="routes.index" [params]="{ id: 1 }">ok: extra params on a param-less route are allowed</a>
  \`,
})
export class Broken {
  routes = routes;
  typo = routes.users.detai;
  missing = routes.users.detail.path({});
}
`;

const expectations = [
  ["has params: add [params]", 'missing [params] is reported'],
  ['does not match the params of route', 'wrong param name / type is reported'],
  ["'lost' is not assignable", 'wrong query value is reported'],
  ["Property 'detai' does not exist", 'route typo is reported'],
  ["Property 'id' is missing", 'path() with missing param is reported'],
];

let output = '';
try {
  writeFileSync(brokenFile, broken);
  writeFileSync(
    tsconfig,
    JSON.stringify(
      {
        extends: './tsconfig.app.json',
        compilerOptions: { noEmit: true },
        files: ['src/main.ts', 'src/app/__broken__.ts'],
      },
      null,
      2,
    ),
  );
  const ngc = join(demo, '..', '..', 'node_modules', '@angular', 'compiler-cli', 'bundles', 'src', 'bin', 'ngc.js');
  const result = spawnSync(process.execPath, [ngc, '-p', tsconfig], { cwd: demo, encoding: 'utf8' });
  output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) {
    console.error('FAIL: the Angular compiler accepted a component with broken typed links.');
    console.error(output);
    process.exit(1);
  }
  let failed = false;
  for (const [needle, label] of expectations) {
    if (output.includes(needle)) {
      console.log(`ok   ${label}`);
    } else {
      console.log(`FAIL ${label} (expected diagnostic containing: ${needle})`);
      failed = true;
    }
  }
  const mismatchCount = output.split('does not match the params of route').length - 1;
  if (mismatchCount < 2) {
    console.log(`FAIL expected at least 2 param mismatch diagnostics, found ${mismatchCount}`);
    failed = true;
  }
  if (failed) {
    console.error('\nCompiler output:\n' + output);
    process.exit(1);
  }
  console.log('\nAll broken links were rejected by the compiler.');
} finally {
  if (existsSync(brokenFile)) rmSync(brokenFile);
  if (existsSync(tsconfig)) rmSync(tsconfig);
}
