import type { Params, QueryParamsHandling, Router, UrlTree } from '@angular/router';
import type { AnyRoute, ParamValue, QueryValue } from './types';

export interface UrlOptions {
  query?: Record<string, QueryValue> | null;
  fragment?: string;
  queryParamsHandling?: QueryParamsHandling | null;
}

/** Splits a navigation options object into route params and the rest. */
export function splitOptions(
  route: AnyRoute,
  options: Record<string, unknown> | undefined,
): { params: Record<string, ParamValue>; rest: Record<string, unknown> } {
  const params: Record<string, ParamValue> = {};
  const rest: Record<string, unknown> = {};
  if (options) {
    for (const key of Object.keys(options)) {
      if (route.paramNames.includes(key)) {
        params[key] = options[key] as ParamValue;
      } else {
        rest[key] = options[key];
      }
    }
  }
  return { params, rest };
}

/** Creates a `UrlTree` for a route, applying query params, fragment and handling. */
export function createRouteUrlTree(
  router: Router,
  route: AnyRoute,
  params: Record<string, ParamValue>,
  options: UrlOptions,
): UrlTree {
  const tree = router.parseUrl(route.path(params));
  const handling = options.queryParamsHandling ?? undefined;
  const current = router.routerState.snapshot.root.queryParams;
  let query: Params | null;
  switch (handling) {
    case 'merge':
      query = { ...current, ...(options.query ?? {}) };
      break;
    case 'preserve':
      query = current;
      break;
    case 'replace':
    default:
      query = (options.query as Params | null | undefined) ?? {};
  }
  tree.queryParams = stripUndefined(query);
  tree.fragment = options.fragment ?? null;
  return tree;
}

function stripUndefined(params: Params | null): Params {
  const out: Params = {};
  if (!params) return out;
  for (const key of Object.keys(params)) {
    if (params[key] !== undefined && params[key] !== null) {
      out[key] = params[key];
    }
  }
  return out;
}
