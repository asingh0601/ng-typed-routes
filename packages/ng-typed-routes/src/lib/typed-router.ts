import { Injectable, inject } from '@angular/core';
import { Router, type IsActiveMatchOptions, type NavigationBehaviorOptions, type QueryParamsHandling, type UrlTree } from '@angular/router';
import { createRouteUrlTree, splitOptions } from './url';
import type { AnyRoute, ParamsOf, QueryOf, RouteHasParams } from './types';

/** Options accepted by `TypedRouter.navigate()` and friends, merged with the route params. */
export type NavigateExtras<R> = {
  /** Typed query parameters declared for the route. */
  query?: QueryOf<R>;
  fragment?: string;
  queryParamsHandling?: QueryParamsHandling;
} & NavigationBehaviorOptions;

export type NavigateOptions<R> = ParamsOf<R> & NavigateExtras<R>;

/** Params are required when the route has any; the whole argument is optional otherwise. */
export type NavigateArgs<R> =
  RouteHasParams<R> extends true ? [options: NavigateOptions<R>] : [options?: NavigateOptions<R>];

/**
 * Typed facade over Angular's `Router`. Every method takes a route object from
 * the generated tree; the compiler enforces its params and query type.
 *
 * ```ts
 * const router = inject(TypedRouter);
 * router.navigate(routes.users.$id.orders, { id, query: { tab: 'open' } });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class TypedRouter {
  readonly router = inject(Router);

  /** Navigates to `route`. Returns Angular's navigation promise. */
  navigate<R extends AnyRoute>(route: R, ...args: NavigateArgs<R>): Promise<boolean> {
    const { tree, behavior } = this.prepare(route, args[0] as Record<string, unknown> | undefined);
    return this.router.navigateByUrl(tree, behavior);
  }

  /** Builds a `UrlTree` for `route`, e.g. for `routerLink` or `isActive`. */
  urlTree<R extends AnyRoute>(route: R, ...args: NavigateArgs<R>): UrlTree {
    return this.prepare(route, args[0] as Record<string, unknown> | undefined).tree;
  }

  /** Serialized URL for `route`, including query string and fragment. */
  url<R extends AnyRoute>(route: R, ...args: NavigateArgs<R>): string {
    return this.router.serializeUrl(this.urlTree(route, ...args));
  }

  /**
   * Whether `route` is currently active. Query params, fragment and matrix params
   * are ignored; `exact` controls whether child routes count as active.
   */
  isActive<R extends AnyRoute>(
    route: R,
    ...args: RouteHasParams<R> extends true
      ? [params: ParamsOf<R>, exact?: boolean]
      : [params?: ParamsOf<R>, exact?: boolean]
  ): boolean {
    const [params, exact] = args as [Record<string, unknown> | undefined, boolean | undefined];
    const tree = this.prepare(route, params).tree;
    const match: IsActiveMatchOptions = {
      paths: exact ? 'exact' : 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    };
    return this.router.isActive(tree, match);
  }

  private prepare(
    route: AnyRoute,
    options: Record<string, unknown> | undefined,
  ): { tree: UrlTree; behavior: NavigationBehaviorOptions } {
    const { params, rest } = splitOptions(route, options);
    const { query, fragment, queryParamsHandling, ...behavior } = rest as NavigateOptions<AnyRoute>;
    const tree = createRouteUrlTree(this.router, route, params, { query, fragment, queryParamsHandling });
    return { tree, behavior };
  }
}
