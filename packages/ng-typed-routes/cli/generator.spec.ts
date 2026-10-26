import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { generate, type GenerateOptions } from './generator.js';
import { parseArgs } from './config.js';
import { normalizeForCompare } from './emit.js';

const fixtures = path.join(__dirname, '__fixtures__');

function fixture(name: string, routes = 'src/app.routes.ts'): GenerateOptions {
  const root = path.join(fixtures, name);
  return {
    routesFile: path.join(root, routes),
    outFile: path.join(root, 'src', 'routes.gen.ts'),
    tsconfig: path.join(root, 'tsconfig.json'),
  };
}

/** Evaluates generated code against the real runtime to assert the produced tree. */
async function evaluate(code: string): Promise<Record<string, any>> {
  const runtime = await import('../src/lib/types');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, any> = {};
  const fn = new Function('require', 'exports', js);
  fn((id: string) => {
    if (id !== 'ng-typed-routes' && id !== '@acme/routing') throw new Error(`unexpected import ${id}`);
    return runtime;
  }, exports);
  return exports['routes'] ?? exports['links'];
}

describe('generate (basic fixture)', () => {
  const result = generate(fixture('basic'));

  it('matches the snapshot', () => {
    expect(result.code).toMatchSnapshot();
  });

  it('emits no unexpected warnings', () => {
    expect(result.warnings).toEqual([]);
  });

  it('follows loadChildren through .then(m => m.X), barrels, default exports and destructuring', async () => {
    const routes = await evaluate(result.code);
    expect(routes['users'].pattern).toBe('/users');
    expect(routes['users'].detail.pattern).toBe('/users/:id');
    expect(routes['users'].detail.orders.pattern).toBe('/users/:id/orders');
    expect(routes['admin'].pattern).toBe('/admin');
    expect(routes['admin'].reports.pattern).toBe('/admin/reports');
    expect(routes['shop'].products.$slug.pattern).toBe('/shop/products/:slug');
    expect(routes['shop'].cart.checkout.pattern).toBe('/shop/cart/checkout');
  });

  it('handles empty paths: root index, transparent layout routes and nested index', async () => {
    const routes = await evaluate(result.code);
    expect(routes['index'].pattern).toBe('/');
    // users layout route with path '' is transparent, its '' child is the users route itself
    expect(routes['users'].pattern).toBe('/users');
    expect(routes['users'].index).toBeUndefined();
    expect(routes['users'].detail.index).toBeUndefined();
    expect(routes['shop'].cart.pattern).toBe('/shop/cart');
  });

  it('nests multi-segment paths and names params with $', async () => {
    const routes = await evaluate(result.code);
    expect(routes['settings'].pattern).toBeUndefined();
    expect(routes['settings'].profile.pattern).toBe('/settings/profile');
    expect(routes['settings'].$section.advanced.pattern).toBe('/settings/:section/advanced');
    expect(routes['settings'].$section.advanced.paramNames).toEqual(['section']);
  });

  it('camelCases kebab segments', async () => {
    const routes = await evaluate(result.code);
    expect(routes['aboutUs'].pattern).toBe('/about-us');
  });

  it('skips wildcard and redirect routes', async () => {
    const routes = await evaluate(result.code);
    expect(routes['old']).toBeUndefined();
    expect(Object.keys(routes).some((k) => k.includes('*'))).toBe(false);
  });

  it('includes spread arrays and identifier routes', async () => {
    const routes = await evaluate(result.code);
    expect(routes['legal'].pattern).toBe('/legal');
    expect(routes['help'].faq.pattern).toBe('/help/faq');
  });

  it('emits named outlets under the outlet name', async () => {
    const routes = await evaluate(result.code);
    expect(routes['aux'].chat.pattern).toBe('/(aux:chat)');
    expect(routes['aux'].chat.outlet).toBe('aux');
    expect(routes['aux'].chat.$room.pattern).toBe('/(aux:chat/:room)');
    expect(routes['aux'].chat.$room.path({ room: 'a b' })).toBe('/(aux:chat/a%20b)');
  });

  it('builds paths with params', async () => {
    const routes = await evaluate(result.code);
    expect(routes['users'].detail.orders.$orderId.path({ id: 1, orderId: 'a b' })).toBe('/users/1/orders/a%20b');
    expect(routes['index'].path()).toBe('/');
  });

  it('emits query and data types from satisfies TypedRoute<...>', () => {
    expect(result.code).toContain("query: { q?: string; sort?: 'asc' | 'desc'; tags?: string[]; page?: number; exact?: boolean; ids?: number[] }");
    expect(result.code).toContain('data: { title: string }');
    expect(result.code).toContain("query: { tab?: 'open' | 'closed' }");
    expect(result.code).toMatch(/^import \{ route, meta \} from 'ng-typed-routes';$/m);
  });

  it('emits a runtime codec for non-string query params', async () => {
    expect(result.code).toContain("}>({ tags: 'string[]', page: 'number', exact: 'boolean', ids: 'number[]' })");
    const routes = await evaluate(result.code);
    expect(routes['search'].queryCodec).toEqual({ tags: 'string[]', page: 'number', exact: 'boolean', ids: 'number[]' });
    expect(routes['users'].detail.orders.queryCodec).toBeUndefined();
  });

  it('is deterministic', () => {
    const again = generate(fixture('basic'));
    expect(again.code).toBe(result.code);
  });

  it('reports every contributing file', () => {
    const names = result.files.map((f) => path.basename(f)).sort();
    expect(names).toEqual(
      expect.arrayContaining(['app.routes.ts', 'users.routes.ts', 'admin.routes.ts', 'shop.routes.ts', 'cart.routes.ts', 'shared.routes.ts']),
    );
  });
});

describe('generate (edge cases)', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function scratch(files: Record<string, string>): GenerateOptions {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtr-'));
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2022', module: 'preserve', moduleResolution: 'bundler', skipLibCheck: true },
        include: ['**/*.ts'],
      }),
    );
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return { routesFile: path.join(dir, 'app.routes.ts'), outFile: path.join(dir, 'routes.gen.ts'), tsconfig: path.join(dir, 'tsconfig.json') };
  }

  it('reads routes wrapped in defineRoutes() and satisfies Routes', async () => {
    const opts = scratch({
      'app.routes.ts': `
        import type { Routes } from '@angular/router';
        declare function defineRoutes<T>(r: T): T;
        class C {}
        export const appRoutes = defineRoutes([
          { path: 'a', component: C, children: [{ path: ':id', component: C }] },
        ] satisfies Routes);
      `,
    });
    const routes = await evaluate(generate(opts).code);
    expect(routes['a'].$id.pattern).toBe('/a/:id');
  });

  it('honours --export and warns on non-literal paths', () => {
    const opts = scratch({
      'app.routes.ts': `
        class C {}
        const dynamic = Math.random() > 0.5 ? 'x' : 'y';
        export const other = [{ path: 'nope', component: C }];
        export const mine = [{ path: 'yes', component: C }, { path: dynamic, component: C }];
      `,
    });
    const result = generate({ ...opts, exportName: 'mine' });
    expect(result.code).toContain("yes: route('/yes')");
    expect(result.code).not.toContain('nope');
    expect(result.warnings.some((w) => w.includes("'path' is not a string literal"))).toBe(true);
  });

  it('renames keys that collide with route members', () => {
    const opts = scratch({
      'app.routes.ts': `
        class C {}
        export const routes = [{ path: 'path', component: C }, { path: 'pattern', component: C }, { path: '42', component: C }];
      `,
    });
    const code = generate(opts).code;
    expect(code).toContain("path_: route('/path')");
    expect(code).toContain("pattern_: route('/pattern')");
    expect(code).toContain("_42: route('/42')");
  });

  it('warns on duplicate routes and keeps the first', () => {
    const opts = scratch({
      'app.routes.ts': `
        class C {}
        export const routes = [{ path: 'a', component: C }, { path: 'a', component: C }];
      `,
    });
    const result = generate(opts);
    expect(result.warnings.some((w) => w.includes('duplicate route'))).toBe(true);
    expect(result.code.match(/route\('\/a'\)/g)).toHaveLength(1);
  });

  it('warns when loadChildren cannot be followed', () => {
    const opts = scratch({
      'app.routes.ts': `
        export const routes = [{ path: 'lazy', loadChildren: () => (window as any).something() }];
      `,
    });
    const result = generate(opts);
    expect(result.warnings.some((w) => w.includes("Could not follow 'loadChildren'"))).toBe(true);
    expect(result.code).toContain("lazy: route('/lazy')");
  });

  it('supports a custom const name and import source', () => {
    const opts = scratch({ 'app.routes.ts': `export const routes = [{ path: 'a' }];` });
    const code = generate({ ...opts, constName: 'links', importFrom: '@acme/routing' }).code;
    expect(code).toContain("from '@acme/routing'");
    expect(code).toContain('export const links = {');
    expect(code).toContain('export type LinksTree = typeof links;');
  });

  it('fails clearly when no routes export exists', () => {
    const opts = scratch({ 'app.routes.ts': `export const x = 1;` });
    expect(() => generate(opts)).toThrow(/Could not find an exported routes array/);
  });
});

describe('normalizeForCompare', () => {
  it('ignores formatting-only differences', () => {
    const a = `export const routes = {\n  a: route('/a'),\n};\n`;
    const b = `export const routes = { a: route("/a") }\n`;
    expect(normalizeForCompare(a)).toBe(normalizeForCompare(b));
  });
  it('detects real changes', () => {
    expect(normalizeForCompare(`a: route('/a')`)).not.toBe(normalizeForCompare(`a: route('/b')`));
  });
});

describe('parseArgs', () => {
  it('parses commands and flags', () => {
    expect(parseArgs(['check', '--routes', 'x.ts', '-o=out.ts', '--quiet'])).toEqual({
      command: 'check',
      flags: { routes: 'x.ts', out: 'out.ts', quiet: true },
    });
    expect(parseArgs([]).command).toBe('generate');
  });
  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });
});
