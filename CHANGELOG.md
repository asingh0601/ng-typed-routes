# Changelog

All notable changes to `ng-typed-routes` are documented here. Releases are managed with
[Changesets](./.changeset/README.md).

## 1.0.0 — 2026-10-26

Initial release.

- `route()` / `meta()` route tree, consumed from a generated `routes.gen.ts`
- `TypedRouter` with `navigate()`, `url()`, `urlTree()` and `isActive()`
- `TypedLinkDirective` (`[typedLink]`, `[params]`, `[query]`) wrapping Angular's `RouterLink` as a host directive, so `routerLinkActive`, `href`, modifier clicks and `target` keep working
- `injectParams()`, `injectQuery()` and `injectData()` signal helpers that read parent params without `paramsInheritanceStrategy`
- Typed query params declared with `satisfies TypedRoute<{ query: ... }>`; `number`, `boolean` and array values are parsed back from the URL using a codec the generator emits
- Zero-codegen mode: `defineRoutes()` + `typedRoutes()` infer the same tree from a static routes array
- CLI `ng-typed-routes generate | watch | check` built on the TypeScript compiler API; follows `children`, spreads, identifiers and every `loadChildren: () => import()` form, including barrel re-exports, default exports and destructured `.then` callbacks
- `ng add ng-typed-routes` schematic: adds npm scripts, a `.prettierignore` entry and runs the first generation
