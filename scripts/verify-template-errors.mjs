// Proves the "broken link is a compile error" promise on the demo app.
// Adds components with deliberate mistakes, type-checks the app with the Angular
// compiler (templates included), asserts every mistake is reported, then cleans up.
//
// Template errors and plain TypeScript errors are checked in two separate passes:
// the Angular compiler skips template type-checking while TypeScript errors exist.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const demo = resolve(here, '..', 'examples', 'demo-app');
const ngc = resolve(here, '..', 'node_modules', '@angular', 'compiler-cli', 'bundles', 'src', 'bin', 'ngc.js');

const passes = [
  {
    name: 'template bindings',
    source: `import { Component } from '@angular/core';
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  imports: [TypedLinkDirective],
  template: \`
    <a [typedLink]="routes.users.detail">missing params</a>
    <a [typedLink]="routes.users.detail" [params]="{ idd: 1 }">wrong param name</a>
    <a [typedLink]="routes.users.detail" [params]="{ id: true }">wrong param type</a>
    <a [typedLink]="routes.users.detail.orders" [params]="{ id: 1 }" [query]="{ status: 'lost' }">wrong query value</a>
    <a [typedLink]="routes.users.detail.orders" [params]="{ id: 1 }" [query]="{ nope: 'x' }">unknown query key</a>
  \`,
})
export class Broken {
  routes = routes;
}
`,
    expectations: [
      ['has params: add [params]', 'missing [params]'],
      ['does not match the params of route', 'wrong param name'],
      [`'"lost"' is not assignable to type '"open" | "shipped"`, 'wrong query value'],
      ['does not exist in type', 'unknown query key'],
    ],
    minCount: ['does not match the params of route', 2, 'wrong param name and wrong param type'],
  },
  {
    name: 'TypeScript usage',
    source: `import { inject } from '@angular/core';
import { TypedRouter, injectParams } from 'ng-typed-routes';
import { routes } from './routes.gen';

export function broken() {
  const typo = routes.users.detai;
  const missing = routes.users.detail.path({});
  const router = inject(TypedRouter);
  void router.navigate(routes.users.detail);
  void router.navigate(routes.users.detail.orders, { id: 1, query: { status: 'lost' } });
  const { nope } = injectParams(routes.users.detail);
  return [typo, missing, nope];
}
`,
    expectations: [
      ["Property 'detai' does not exist", 'route typo'],
      ["Property 'id' is missing", 'path() without params'],
      ['Expected 2 arguments, but got 1', 'navigate() without params'],
      [`'"lost"' is not assignable to type '"open" | "shipped"`, 'navigate() with wrong query value'],
      ["Property 'nope' does not exist", 'injectParams() unknown param'],
    ],
  },
];

let failed = false;
for (const pass of passes) {
  const file = join(demo, 'src', 'app', '__broken__.ts');
  const tsconfig = join(demo, 'tsconfig.verify.json');
  let output = '';
  try {
    writeFileSync(file, pass.source);
    writeFileSync(
      tsconfig,
      JSON.stringify(
        { extends: './tsconfig.app.json', compilerOptions: { noEmit: true }, files: ['src/main.ts', 'src/app/__broken__.ts'] },
        null,
        2,
      ),
    );
    const result = spawnSync(process.execPath, [ngc, '-p', tsconfig], { cwd: demo, encoding: 'utf8' });
    output = `${result.stdout}\n${result.stderr}`;
    console.log(`\n[${pass.name}]`);
    if (result.status === 0) {
      console.log('FAIL the compiler accepted the broken code');
      failed = true;
      continue;
    }
    for (const [needle, label] of pass.expectations) {
      if (output.includes(needle)) {
        console.log(`ok   ${label}`);
      } else {
        console.log(`FAIL ${label} (expected a diagnostic containing: ${needle})`);
        failed = true;
      }
    }
    if (pass.minCount) {
      const [needle, min, label] = pass.minCount;
      const count = output.split(needle).length - 1;
      if (count >= min) console.log(`ok   ${label} (${count} diagnostics)`);
      else {
        console.log(`FAIL ${label}: expected ${min} diagnostics, found ${count}`);
        failed = true;
      }
    }
  } finally {
    if (existsSync(file)) rmSync(file);
    if (existsSync(tsconfig)) rmSync(tsconfig);
  }
  if (failed) console.error('\nCompiler output:\n' + output);
}

if (failed) process.exit(1);
console.log('\nAll broken links and navigations were rejected by the compiler.');
