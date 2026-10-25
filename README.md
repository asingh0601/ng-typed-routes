# ng-typed-routes

Type-safe routing for Angular, generated from your existing `app.routes.ts`.
Rename a route, run `ng-typed-routes generate`, and every stale link turns red in your editor.

> Status: pre-release (0.x). Not yet published to npm. See "Known gaps" below.

```ts
// generated: src/app/routes.gen.ts
routes.users.detail                      // RouteDef<'/users/:id'>
routes.users.detail.orders.path({ id })  // '/users/1/orders'

// runtime
const router = inject(TypedRouter);
router.navigate(routes.users.detail.orders, { id, query: { status: 'open' } });
const { id } = injectParams(routes.users.detail);   // Signal<string>
const { status } = injectQuery(routes.users.detail.orders);
```

```html
<a [typedLink]="routes.users.detail" [params]="{ id: user.id }" [query]="{ status: 'open' }">Orders</a>
```

## Install

```bash
ng add ng-typed-routes
```

This adds `routes:generate`, `routes:watch` and `routes:check` scripts and generates `src/app/routes.gen.ts`.
Commit the generated file and run `npm run routes:check` in CI (exit code 1 when it is stale).

## How routes are named

| Angular path                         | Generated key                      |
| ------------------------------------ | ---------------------------------- |
| `users`                              | `routes.users`                     |
| `user-settings`                      | `routes.userSettings`              |
| `:id` (child of `users`)             | `routes.users.$id`                 |
| `''` at the root                     | `routes.index`                     |
| `''` with children (layout route)    | transparent, children are hoisted  |
| `admin/reports`                      | `routes.admin.reports`             |
| `{ path: 'chat', outlet: 'aux' }`    | `routes.aux.chat`                  |
| `**`, `redirectTo`                   | skipped (not navigation targets)   |

Override a name and declare query/data types with a type-only `satisfies`:

```ts
{ path: ':id', component: UserDetail } satisfies TypedRoute<{ name: 'detail'; query: { tab?: 'open' | 'closed' } }>
```

## CLI

```
ng-typed-routes [generate] [-r routes.ts] [-o routes.gen.ts] [-p tsconfig.app.json] [-e exportName] [--stdout]
ng-typed-routes watch
ng-typed-routes check
```

Options can also live in `ng-typed-routes.config.json`. The generator follows `children`, spreads,
identifiers and every `loadChildren: () => import(...)` form (`.then(m => m.X)`, `.then(({ X }) => X)`,
default exports, barrel re-exports) using the TypeScript compiler API.

## Zero-codegen mode (small apps without lazy routes)

```ts
export const appRoutes = defineRoutes([{ path: 'users', children: [{ path: ':id', component: UserDetail }] }]);
export const routes = typedRoutes(appRoutes); // routes.users.$id.path({ id })
provideRouter(appRoutes);
```

`defineRoutes()` keeps literal types without `as const` (which would make the array readonly and
incompatible with `Routes`). Query/data declarations and `loadChildren` are not visible to this mode.

## Repository

```bash
npm install && npm run build && npm test     # library, CLI, type tests, TestBed tests
npm run demo:generate && npm run demo:build  # examples/demo-app
npm run demo:verify-type-errors              # asserts broken links fail compilation (see Known gaps)
```

Publish (after `npm run build`): `npm publish packages/ng-typed-routes/dist --access public`,
or via the Changesets release workflow (`.github/workflows/release.yml`, needs `NPM_TOKEN`).

## Known gaps

- **Template `[params]` checking does not fire yet.** `path()`, `TypedRouter.navigate()`, `injectParams`
  and route-name typos are compile errors (verified). The `[typedLink]`/`[params]` template check is
  verified at the TypeScript level (`src/lib/types.test-d.ts`, `scripts/dump-tcb.mjs` reproduction) but
  Angular's compiler currently accepts a missing or wrong `[params]`; the generated type constructor
  declaration needs to be inspected (`scripts/dump-tcb.mjs`). Tracked in the hand-over notes.
- Query values are strings only; no runtime validation.
- Named outlets: children not generated; `path()` uses Angular's `(outlet:segment)` URL syntax.
- Custom `matcher` routes and non-literal `path` values are skipped with a warning.
- Requires Angular 22, TypeScript 6.0, Node 22.22+/24.15+.
