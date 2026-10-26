# ng-typed-routes

Type-safe routing for Angular, generated from the `app.routes.ts` you already have. A typo in a link, a missing `:id`, a query param with the wrong value: all compile errors, not runtime 404s.

**[Live demo](https://angx-libs.github.io/ng-typed-routes/)** · [npm](https://www.npmjs.com/package/ng-typed-routes)

```html
<!-- Angular today: a string, checked by nobody -->
<a [routerLink]="['/users', user.id, 'orders']" [queryParams]="{ status: 'open' }">Orders</a>

<!-- ng-typed-routes: every part is checked by the compiler -->
<a [typedLink]="routes.users.detail.orders" [params]="{ id: user.id }" [query]="{ status: 'open' }">Orders</a>
```

Rename `users/:id` to `members/:id` in `app.routes.ts`, run `npm run routes:generate`, and every stale link, navigation and param read in the app turns red. Angular is the only major framework whose router links and params are untyped; this fills that gap without replacing the router.

## Features

- **Generated from your routes file**, not a parallel definition. `loadChildren` is followed through dynamic imports, barrels, default exports and `.then(m => m.X)`; `children`, `path: ''`, `pathMatch`, `**`, redirects and named outlets are understood.
- **Typed everywhere**: `[typedLink]` + `[params]` + `[query]` in templates, `TypedRouter.navigate()` in code, `injectParams()` / `injectQuery()` / `injectData()` signals in components.
- **Wraps Angular's `RouterLink`** as a host directive, so `routerLinkActive`, `href`, middle-click, `target`, `fragment` and `queryParamsHandling` keep working.
- **Signals-first, standalone-only, zoneless-compatible.** No NgModules, no Zone.js, no RxJS in your code.
- **Typed query params** declared with a type-only `satisfies TypedRoute<...>`. `number`, `boolean` and array params are parsed back from the URL.
- **CI guard**: `ng-typed-routes check` fails the build when the generated file is stale.
- **Zero-codegen mode** for small apps: `defineRoutes()` infers the same tree from a static routes array.
- Zero runtime dependencies besides Angular; the CLI uses the TypeScript already in your project.

## Requirements

Angular 22, TypeScript 6.0, Node 22.22+ or 24.15+ (Angular 22's own requirements). `strictTemplates` must be on (it is, in every CLI-generated app).

## Install

```bash
ng add ng-typed-routes
```

This installs the package, adds three npm scripts (`routes:generate`, `routes:watch`, `routes:check`), adds `routes.gen.ts` to `.prettierignore` when you have one, and runs the first generation. Commit `src/app/routes.gen.ts`.

Without the schematic:

```bash
npm i ng-typed-routes
npx ng-typed-routes generate
```

## Usage

### The generated file

Given this `app.routes.ts`:

```ts
export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full' },
  { path: 'users', loadChildren: () => import('./users/users.routes').then((m) => m.USERS_ROUTES) },
  { path: 'settings/:section', component: Settings } satisfies TypedRoute<{ query: { tab?: 'general' | 'advanced' } }>,
  { path: '**', component: NotFound },
];

// users/users.routes.ts
export const USERS_ROUTES: Routes = [
  { path: '', component: UserList },
  {
    path: ':id',
    component: UserDetail,
    children: [
      { path: 'profile', component: UserProfile },
      { path: 'orders', component: UserOrders } satisfies TypedRoute<{ query: { status?: 'open' | 'shipped' } }>,
    ],
  } satisfies TypedRoute<{ name: 'detail' }>,
];
```

`ng-typed-routes generate` writes `src/app/routes.gen.ts`:

```ts
import { route, meta } from 'ng-typed-routes';

export const routes = {
  index: route('/'),
  users: route('/users', {
    detail: route('/users/:id', {
      profile: route('/users/:id/profile'),
      orders: route('/users/:id/orders', {}, meta<{ query: { status?: 'open' | 'shipped' } }>()),
    }),
  }),
  settings: {
    $section: route('/settings/:section', {}, meta<{ query: { tab?: 'general' | 'advanced' } }>()),
  },
};
```

Each route object knows its `pattern`, its `paramNames` and can build its URL:

```ts
routes.users.detail.orders.path({ id: 1 }); // '/users/1/orders'
routes.users.detail.orders.path({});        // compile error: 'id' is missing
```

### Links

```ts
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  imports: [TypedLinkDirective, RouterLinkActive],
  template: `
    <a [typedLink]="r.index" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
    <a [typedLink]="r.users.detail" [params]="{ id: user.id }">Profile</a>
    <a [typedLink]="r.users.detail.orders" [params]="{ id: user.id }" [query]="{ status: 'open' }" fragment="top">Orders</a>
  `,
})
export class Nav {
  protected readonly r = routes;
}
```

`[params]` is required exactly when the route has params, and its keys and types must match. `[query]` must match the declared query type. `fragment`, `queryParamsHandling`, `preserveFragment`, `replaceUrl`, `skipLocationChange`, `state`, `info`, `target` and `browserUrl` are forwarded to Angular's `RouterLink`.

### Navigation

```ts
import { TypedRouter } from 'ng-typed-routes';

export class UserOrders {
  private readonly router = inject(TypedRouter);

  filter(status: 'open' | 'shipped') {
    this.router.navigate(routes.users.detail.orders, { id: this.id(), query: { status } });
  }
}
```

`navigate()` takes the route params plus `query`, `fragment`, `queryParamsHandling` and Angular's `NavigationBehaviorOptions` (`replaceUrl`, `state`, ...). `url()` and `urlTree()` build without navigating; `isActive()` checks the current URL.

### Params, query and data as signals

```ts
import { injectParams, injectQuery, injectData } from 'ng-typed-routes';

export class UserOrders {
  readonly id = injectParams(routes.users.detail.orders).id;        // Signal<string>
  readonly status = injectQuery(routes.users.detail.orders).status; // Signal<'open' | 'shipped' | undefined>
  readonly data = injectData(routes.users.detail);                  // Signal<{ title: string }> when declared
}
```

`injectParams` reads the component's `ActivatedRoute` and all of its ancestors, so a child component gets the parent's `:id` without `paramsInheritanceStrategy: 'always'`. The signals update on navigation and the component is reused.

### Declaring query params, data and names

Add a type-only `satisfies` to a route. It changes nothing at runtime; the generator reads the type argument.

```ts
{
  path: 'search',
  component: Search,
} satisfies TypedRoute<{
  query: { q?: string; sort?: 'asc' | 'desc'; page?: number; exact?: boolean; tags?: string[] };
  data: { title: string };
  name: 'search';
}>
```

| Option  | Effect                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query` | Typed `[query]`, `navigate({ query })` and `injectQuery()`. `number`, `boolean`, `string[]` and `number[]` values are parsed back from the URL.      |
| `data`  | Type of `injectData()` for this route.                                                                                                              |
| `name`  | Property name in the generated tree (`routes.users.detail` instead of `routes.users.$id`).                                                          |

Query types must be inline object types with primitive, literal-union or array values. Values are not validated at runtime: a URL can always carry `?sort=sideways`.

### How routes are named

| Angular route                           | Generated key                     |
| --------------------------------------- | --------------------------------- |
| `users`                                 | `routes.users`                    |
| `user-settings`                         | `routes.userSettings`             |
| `:id` (child of `users`)                | `routes.users.$id`                |
| `''` at the root                        | `routes.index`                    |
| `''` inside a route                     | merged into the parent route      |
| `''` with children (layout route)       | transparent, children are hoisted |
| `admin/reports/:year`                   | `routes.admin.reports.$year`      |
| `{ path: 'chat', outlet: 'aux' }`       | `routes.aux.chat`                 |
| `**`, `redirectTo`, custom `matcher`    | skipped (not navigation targets)  |

Keys that would shadow a route member (`path`, `pattern`, ...) get a trailing `_`; keys starting with a digit get a leading `_`.

## CLI

```
ng-typed-routes [generate] [options]   Generate routes.gen.ts (default)
ng-typed-routes watch [options]        Regenerate whenever a source file under src/ changes
ng-typed-routes check [options]        Exit 1 if routes.gen.ts is missing or stale
```

| Option                     | Default                                      |
| -------------------------- | -------------------------------------------- |
| `-r, --routes <file>`      | `src/app/app.routes.ts`                      |
| `-o, --out <file>`         | `routes.gen.ts` next to the routes file      |
| `-p, --tsconfig <file>`    | nearest `tsconfig.app.json` or `tsconfig.json` |
| `-e, --export <name>`      | auto-detected (`Routes`-typed export)        |
| `--name <name>`            | `routes` (name of the generated constant)    |
| `--import-from <module>`   | `ng-typed-routes`                            |
| `--stdout`                 | print instead of writing                     |
| `-q, --quiet`              | errors only                                  |

The same keys can live in `ng-typed-routes.config.json` next to `package.json`; flags win. The generator warns (and keeps going) for routes it cannot read statically: non-literal `path` values, `loadChildren` it cannot follow, custom matchers.

`check` ignores whitespace, quote style and trailing commas, so a formatter run over the generated file does not count as stale.

### CI

```yaml
- run: npm ci
- run: npm run routes:check   # fails when routes.gen.ts is out of date
- run: npm run build
```

Run `routes:generate` before `ng build` instead if you prefer not to commit the generated file.

## Zero-codegen mode

For small apps without `loadChildren`, skip the CLI and infer the tree from the routes array itself:

```ts
import { defineRoutes, typedRoutes } from 'ng-typed-routes';

export const appRoutes = defineRoutes([
  { path: '', component: Home },
  { path: 'users', children: [{ path: ':id', component: UserDetail }] },
]);
export const routes = typedRoutes(appRoutes);

provideRouter(appRoutes);
routes.users.$id.path({ id: 1 }); // '/users/1'
```

`defineRoutes()` is an identity function with a `const` type parameter: it keeps the literal types of the array without `as const`, which would make it `readonly` and incompatible with Angular's `Routes`. Compared to the generator this mode cannot see through `loadChildren`, does not know query/data declarations and skips named outlets.

## API

| Export                                        | Description                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `TypedLinkDirective`                          | `[typedLink]`, `[params]`, `[query]`; host directive over `RouterLink`                             |
| `TypedRouter`                                 | `navigate()`, `url()`, `urlTree()`, `isActive()`                                                 |
| `injectParams(route)`                         | `{ [param]: Signal<string> }`                                                                    |
| `injectQuery(route)`                          | `{ [key]: Signal<T \| undefined> }` for each declared query param                                |
| `injectData(route)`                           | `Signal<Data>` of the route and its ancestors                                                    |
| `route(pattern, children?, meta?)`, `meta()`  | Used by the generated file                                                                       |
| `defineRoutes()`, `typedRoutes()`             | Zero-codegen mode                                                                                |
| `TypedRoute<{ query; data; name }>`           | Type-only declaration for `satisfies`                                                            |
| `RouteDef`, `AnyRoute`, `ParamsOf`, `QueryOf`, `DataOf`, `PathParams`, `ParamName` | Types for your own helpers                                    |

## Limitations

- Routes are resolved statically. A `path` computed at runtime, a `loadChildren` that is not a dynamic `import()` of a module in the same TypeScript project, or a custom `matcher` is skipped with a warning.
- Query params are typed, not validated. Parse untrusted values yourself where it matters.
- Interfaces are not accepted as query types (they lack an index signature); use inline object types or type aliases.
- Named outlets: `path()` produces Angular's `(outlet:segments)` URL syntax; `[typedLink]` hands `RouterLink` a `UrlTree` for them, so `queryParamsHandling` cannot be combined with an outlet link.
- Generation reads your whole TypeScript project through the compiler API. On large apps `watch` takes a few seconds per change.

## Development

```bash
npm install
npm run build                    # library (ng-packagr), CLI and schematic into packages/ng-typed-routes/dist
npm test                         # generator tests, type-level tests, TestBed runtime tests
npm run demo:generate            # regenerate examples/demo-app/src/app/routes.gen.ts (calls dist/cli/bin.js directly:
                                 # npm only links a workspace bin that exists at install time)
npm run demo:build               # build the demo app against the built package
npm run demo:verify-type-errors  # proves that broken links fail the Angular compiler
```

Releases use Changesets: run `npx changeset`, merge, and the release workflow publishes `packages/ng-typed-routes/dist` to npm once the `NPM_TOKEN` secret and the `NPM_PUBLISH_ENABLED=true` repository variable are set. The demo is deployed to GitHub Pages from `main` by `.github/workflows/deploy-demo.yml`.

## Support

If you like my work and feel like buying me a coffee, please feel free to do so:

[Buy Me A Coffee](https://buymeacoffee.com/er.abhishek)

## License

MIT © Abhishek Singh

[GitHub](https://github.com/asingh0601) · [Twitter](https://twitter.com/only_abhishek)
