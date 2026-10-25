import type { Route } from '@angular/router';

/** A value accepted for a path parameter when building a URL. */
export type ParamValue = string | number;

/** A query parameter value as Angular's router represents it. */
export type QueryValue = string | readonly string[] | undefined;

/**
 * Shape of a declared query-param type. Values must be strings (or string
 * literal unions, or string arrays) because that is what a URL carries.
 * Numbers and booleans must be parsed by the application.
 */
export type QueryShape = Record<string, QueryValue>;

/** What can be declared about a route via `satisfies TypedRoute<...>` or `meta<...>()`. */
export interface MetaShape {
  /** Typed query parameters for this route. */
  query?: QueryShape;
  /** Type of the static `data` attached to this route. */
  data?: object;
  /** Overrides the generated property name for this route. */
  name?: string;
}

type Segments<S extends string> = S extends `${infer A}/${infer B}` ? A | Segments<B> : S;

/** Union of parameter names in a pattern: `ParamName<'/users/:id/orders/:orderId'>` = `'id' | 'orderId'`. */
export type ParamName<P extends string> = Segments<P> extends infer Seg
  ? Seg extends `:${infer N})`
    ? N
    : Seg extends `:${infer N}`
      ? N
      : never
  : never;

/** Parameters required to build a URL for a pattern. */
export type PathParams<P extends string> = { [K in ParamName<P>]: ParamValue };

/** Parameters as read back from the URL. */
export type ParamValues<P extends string> = { readonly [K in ParamName<P>]: string };

export type HasParams<P extends string> = [ParamName<P>] extends [never] ? false : true;

export type PathArgs<P extends string> =
  HasParams<P> extends true ? [params: PathParams<P>] : [params?: PathParams<P>];

/**
 * A single route in the generated tree. `P` is the absolute pattern
 * (`'/users/:id'`), `Q` the declared query type and `D` the declared data type.
 * Child routes are intersected onto this type by `route()`.
 */
export interface RouteDef<P extends string = string, Q extends QueryShape = {}, D = {}> {
  /** Absolute pattern, e.g. `'/users/:id'`. */
  readonly pattern: P;
  /** Parameter names in order of appearance. */
  readonly paramNames: readonly ParamName<P>[];
  /** Named outlet this route renders into, or `undefined` for the primary outlet. */
  readonly outlet: string | undefined;
  /** Builds the URL path (without query string) for this route. */
  path(...args: PathArgs<P>): string;
  /** Phantom: declared query type. Never set at runtime. */
  readonly ɵquery?: Q;
  /** Phantom: declared data type. Never set at runtime. */
  readonly ɵdata?: D;
}

/** Structural supertype of every `RouteDef`, used as a generic bound. */
export interface AnyRoute {
  readonly pattern: string;
  readonly paramNames: readonly string[];
  readonly outlet: string | undefined;
  path(...args: any[]): string;
  readonly ɵquery?: any;
  readonly ɵdata?: any;
}

export type PatternOf<R> = R extends { readonly pattern: infer P extends string } ? P : never;
/** Params accepted when navigating to `R`. */
export type ParamsOf<R> = PathParams<PatternOf<R>>;
/** Params as read from the URL for `R`. */
export type ParamValuesOf<R> = ParamValues<PatternOf<R>>;
export type QueryOf<R> = R extends { readonly ɵquery?: infer Q }
  ? Exclude<Q, undefined> extends QueryShape
    ? Exclude<Q, undefined>
    : {}
  : {};
export type DataOf<R> = R extends { readonly ɵdata?: infer D } ? Exclude<D, undefined> : {};
export type RouteHasParams<R> = HasParams<PatternOf<R>>;

/** Carrier for declared metadata; produced by `meta<...>()`. Has no runtime content. */
export interface RouteMeta<M extends MetaShape = {}> {
  readonly ɵmeta?: M;
}

type QueryOfMeta<M> = M extends { query: infer Q extends QueryShape } ? Q : {};
type DataOfMeta<M> = M extends { data: infer D } ? D : {};

/**
 * Attach a type-only declaration to a route in your `app.routes.ts`:
 *
 * ```ts
 * { path: 'users/:id', component: UserDetail }
 *   satisfies TypedRoute<{ query: { tab?: 'open' | 'closed' }; data: { title: string } }>
 * ```
 *
 * The generator reads the type argument and emits it into `routes.gen.ts`.
 * At runtime this is just Angular's `Route`.
 */
export type TypedRoute<_M extends MetaShape = {}> = Route;

/** Declares query/data types for a generated route. Erased at runtime. */
export function meta<M extends MetaShape>(): RouteMeta<M> {
  return EMPTY_META as RouteMeta<M>;
}
const EMPTY_META: RouteMeta = Object.freeze({});

/**
 * Creates a route object. Used by generated code; you rarely call it yourself.
 *
 * ```ts
 * route('/users/:id', { orders: route('/users/:id/orders') }, meta<{ query: { tab?: string } }>())
 * ```
 */
export function route<
  P extends string,
  const C extends Record<string, unknown> = {},
  M extends MetaShape = {},
>(pattern: P, children?: C, _meta?: RouteMeta<M>): RouteDef<P, QueryOfMeta<M>, DataOfMeta<M>> & C {
  const def: RouteDef<P, QueryOfMeta<M>, DataOfMeta<M>> = {
    pattern,
    paramNames: extractParamNames(pattern) as ParamName<P>[],
    outlet: extractOutlet(pattern),
    path: ((params?: Record<string, ParamValue>) => buildPath(pattern, params)) as RouteDef<P>['path'],
  };
  return Object.assign(def, children ?? ({} as C));
}

/** Parameter names of a pattern, in order. Understands the `(outlet:segment)` form. */
export function extractParamNames(pattern: string): string[] {
  const names: string[] = [];
  for (const segment of pattern.split('/')) {
    if (segment.startsWith(':')) {
      names.push(segment.slice(1).replace(/\)$/, ''));
    } else if (segment.startsWith('(')) {
      const inner = segment.slice(segment.indexOf(':') + 1).replace(/\)$/, '');
      if (inner.startsWith(':')) {
        names.push(inner.slice(1));
      }
    }
  }
  return names;
}

export function extractOutlet(pattern: string): string | undefined {
  const m = /\/?\(([^:()]+):/.exec(pattern);
  return m ? m[1] : undefined;
}

/** Replaces `:param` placeholders with encoded values. */
export function buildPath(pattern: string, params?: Record<string, ParamValue> | null): string {
  const replaceToken = (token: string): string => {
    const name = token.slice(1);
    const value = params?.[name];
    if (value === undefined || value === null) {
      throw new Error(`[ng-typed-routes] Missing value for param ':${name}' of route '${pattern}'.`);
    }
    return encodeURIComponent(String(value));
  };
  const out = pattern.split('/').map((segment) => {
    if (segment.startsWith(':')) {
      const closing = segment.endsWith(')');
      return replaceToken(closing ? segment.slice(0, -1) : segment) + (closing ? ')' : '');
    }
    if (segment.startsWith('(')) {
      const colon = segment.indexOf(':');
      const head = segment.slice(0, colon + 1);
      let rest = segment.slice(colon + 1);
      const closing = rest.endsWith(')');
      if (closing) rest = rest.slice(0, -1);
      return head + (rest.startsWith(':') ? replaceToken(rest) : rest) + (closing ? ')' : '');
    }
    return segment;
  });
  const joined = out.join('/');
  return joined === '' ? '/' : joined;
}
