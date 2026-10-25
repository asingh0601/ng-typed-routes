import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type Data, type Params } from '@angular/router';
import { combineLatest, map } from 'rxjs';
import type { AnyRoute, DataOf, ParamValuesOf, QueryOf } from './types';

/** One `Signal<string>` per route parameter. */
export type ParamSignals<R> = { readonly [K in keyof ParamValuesOf<R>]: Signal<string> };

/** One signal per declared query param. Values are `undefined` when absent from the URL. */
export type QuerySignals<R> = { readonly [K in keyof QueryOf<R>]-?: Signal<QueryOf<R>[K] | undefined> };

export interface InjectOptions {
  /** Read from this `ActivatedRoute` instead of the injected one. */
  activatedRoute?: ActivatedRoute;
}

/**
 * Signals for the params of `route`, read from the current `ActivatedRoute`
 * and all of its ancestors, so a child component can read a parent's `:id`
 * without `paramsInheritanceStrategy: 'always'`.
 *
 * ```ts
 * const { id } = injectParams(routes.users.$id); // Signal<string>
 * ```
 */
export function injectParams<R extends AnyRoute>(route: R, options?: InjectOptions): ParamSignals<R> {
  const activated = options?.activatedRoute ?? inject(ActivatedRoute);
  const merged = mergedParams(activated);
  const result: Record<string, Signal<string>> = {};
  for (const name of route.paramNames) {
    result[name] = computed(() => {
      const value = merged()[name];
      return value === undefined ? '' : String(value);
    });
  }
  return result as ParamSignals<R>;
}

/**
 * Signals for the query params declared on `route`.
 *
 * ```ts
 * const { tab } = injectQuery(routes.users.$id); // Signal<'open' | 'closed' | undefined>
 * ```
 *
 * Values are not validated at runtime: a URL can always carry a value outside
 * the declared union.
 */
export function injectQuery<R extends AnyRoute>(_route: R, options?: InjectOptions): QuerySignals<R> {
  const activated = options?.activatedRoute ?? inject(ActivatedRoute);
  const query = toSignal(activated.queryParams, { initialValue: activated.snapshot?.queryParams ?? {} });
  const cache = new Map<string, Signal<unknown>>();
  return new Proxy({} as Record<string, Signal<unknown>>, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      let sig = cache.get(key);
      if (!sig) {
        sig = computed(() => query()[key]);
        cache.set(key, sig);
      }
      return sig;
    },
    has: () => true,
    ownKeys: () => [...cache.keys()],
    getOwnPropertyDescriptor: (_t, key) =>
      typeof key === 'string' && cache.has(key)
        ? { configurable: true, enumerable: true, value: cache.get(key) }
        : undefined,
  }) as QuerySignals<R>;
}

/** Signal of the merged `data` of the active route and its ancestors, typed by the route's declaration. */
export function injectData<R extends AnyRoute>(_route: R, options?: InjectOptions): Signal<DataOf<R>> {
  const activated = options?.activatedRoute ?? inject(ActivatedRoute);
  const chain = activated.pathFromRoot;
  const initial = Object.assign({}, ...chain.map((r) => r.snapshot?.data ?? {})) as Data;
  return toSignal(
    combineLatest(chain.map((r) => r.data)).pipe(map((all) => Object.assign({}, ...all) as Data)),
    { initialValue: initial },
  ) as Signal<DataOf<R>>;
}

function mergedParams(activated: ActivatedRoute): Signal<Params> {
  const chain = activated.pathFromRoot;
  const initial = Object.assign({}, ...chain.map((r) => r.snapshot?.params ?? {})) as Params;
  return toSignal(
    combineLatest(chain.map((r) => r.params)).pipe(map((all) => Object.assign({}, ...all) as Params)),
    { initialValue: initial },
  );
}
