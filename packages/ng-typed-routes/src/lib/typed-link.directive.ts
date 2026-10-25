import { Directive, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createRouteUrlTree } from './url';
import type { AnyRoute, ParamsOf, PatternOf, QueryOf, RouteHasParams } from './types';

/** Error type surfaced in templates when `[params]` is missing or wrong. */
export interface TypedLinkError<Message extends string> {
  readonly 'ng-typed-routes': Message;
}

type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Type of the `typedLink` input, computed from the route `R` and the `[params]`
 * value `P`. When a route has params and `[params]` is absent (Angular passes
 * `any` for unset inputs) or does not match, the input type collapses to an
 * error type so the route object is no longer assignable to it.
 */
export type TypedLinkInput<R, P> =
  RouteHasParams<R> extends true
    ? IsAny<P> extends true
      ? TypedLinkError<`Route '${PatternOf<R>}' has params: add [params]`>
      : [P] extends [ParamsOf<R>]
        ? [keyof P] extends [keyof ParamsOf<R>]
          ? R
          : TypedLinkError<`[params] has keys unknown to route '${PatternOf<R>}'`>
        : TypedLinkError<`[params] does not match the params of route '${PatternOf<R>}'`>
    : R;

/**
 * Type-safe `routerLink`.
 *
 * ```html
 * <a [typedLink]="routes.users.$id" [params]="{ id: user.id }" [query]="{ tab: 'open' }">
 * ```
 *
 * Wraps Angular's `RouterLink` as a host directive, so `routerLinkActive`,
 * `href` generation, middle-click and `target` all keep working. Inputs
 * `fragment`, `queryParamsHandling`, `preserveFragment`, `replaceUrl`,
 * `skipLocationChange`, `state`, `info`, `target` and `browserUrl` are
 * forwarded to `RouterLink`.
 */
@Directive({
  selector: '[typedLink]',
  hostDirectives: [
    {
      directive: RouterLink,
      inputs: [
        'fragment',
        'queryParamsHandling',
        'preserveFragment',
        'replaceUrl',
        'skipLocationChange',
        'state',
        'info',
        'target',
        'browserUrl',
      ],
    },
  ],
})
export class TypedLinkDirective<R extends AnyRoute = AnyRoute, P = unknown> {
  /** The route object from the generated tree. */
  readonly typedLink = input.required<TypedLinkInput<R, P>>();
  /** Route params. Required (by the compiler) when the route has any. */
  readonly params = input<P>();
  /** Typed query params declared for the route. */
  readonly query = input<QueryOf<R> | undefined>();

  private readonly link = inject(RouterLink, { self: true });
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const route = this.typedLink() as unknown as AnyRoute;
      const params = (this.params() ?? {}) as Record<string, string | number>;
      const query = this.query() as Record<string, string | readonly string[] | undefined> | undefined;
      untracked(() => {
        if (route.outlet !== undefined) {
          // Named-outlet URLs cannot be expressed as string commands; hand RouterLink a UrlTree.
          this.link.routerLink = createRouteUrlTree(this.router, route, params, { query });
        } else {
          this.link.routerLink = route.path(params);
          this.link.queryParams = query ?? undefined;
        }
        this.link.ngOnChanges({});
      });
    });
  }
}
