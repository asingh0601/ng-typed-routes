import type { Route } from '@angular/router';
import {
  INDEX_KEY,
  avoidReserved,
  joinPattern,
  segmentToKey,
  splitSegments,
} from './naming';
import { route, type RouteDef } from './types';

/**
 * Zero-codegen mode.
 *
 * `defineRoutes()` is an identity function with a `const` type parameter: it
 * keeps the literal types of your routes array without `as const` (which
 * would make the array `readonly` and therefore not assignable to Angular's
 * `Routes`). `typedRoutes()` then builds the same tree the generator would
 * emit, typed from those literals.
 *
 * ```ts
 * export const appRoutes = defineRoutes([
 *   { path: '', component: Home },
 *   { path: 'users', children: [{ path: ':id', component: UserDetail }] },
 * ]);
 * export const routes = typedRoutes(appRoutes);
 * routes.users.$id.path({ id: '1' }); // '/users/1'
 * ```
 *
 * Limits compared to the generator: `loadChildren` modules are not followed,
 * query/data declarations are not visible to the type system, and named
 * outlets are skipped.
 */
export function defineRoutes<const T extends Route[]>(routes: T): T {
  return routes;
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type SegKey<S extends string> = S extends `:${infer N}` ? `$${N}` : Camel<S>;
type Join<Prefix extends string, Seg extends string> = Prefix extends '/' ? `/${Seg}` : `${Prefix}/${Seg}`;
type Split<P extends string> = P extends `${infer A}/${infer B}` ? [A, ...Split<B>] : [P];

type ChildrenOf<R> = R extends { readonly children: infer C extends readonly unknown[] }
  ? C extends readonly []
    ? never
    : C
  : never;

type Nest<Segs extends readonly string[], Prefix extends string, R> = Segs extends [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Rest extends []
    ? {
        [K in SegKey<Head>]: RouteDef<Join<Prefix, Head>> &
          ([ChildrenOf<R>] extends [never] ? {} : TypedTree<ChildrenOf<R>, Join<Prefix, Head>>);
      }
    : { [K in SegKey<Head>]: Nest<Rest, Join<Prefix, Head>, R> }
  : {};

type RouteEntry<R, Prefix extends string> = R extends { readonly outlet: string }
  ? {}
  : R extends { readonly redirectTo: unknown }
    ? {}
    : R extends { readonly path: infer P extends string }
      ? P extends '**'
        ? {}
        : P extends ''
          ? [ChildrenOf<R>] extends [never]
            ? Prefix extends ''
              ? { [K in typeof INDEX_KEY]: RouteDef<'/'> }
              : {} // the parent route already is this URL
            : TypedTree<ChildrenOf<R>, Prefix>
          : Nest<Split<P>, Prefix, R>
      : {};

/** The route tree type inferred from a literal routes array. */
export type TypedTree<T extends readonly unknown[], Prefix extends string = ''> = Simplify<
  UnionToIntersection<T[number] extends infer R ? (R extends object ? RouteEntry<R, Prefix> : never) : never>
>;

/** Builds the typed route tree at runtime from a routes array created with `defineRoutes()`. */
export function typedRoutes<const T extends readonly Route[]>(routes: T): TypedTree<T> {
  return buildTree(routes, '') as TypedTree<T>;
}

interface Node {
  pattern?: string;
  children: Map<string, Node>;
}

function buildTree(routes: readonly Route[], prefix: string): Record<string, unknown> {
  const root: Node = { children: new Map() };
  collect(routes, prefix, root);
  return materialize(root);
}

function collect(routes: readonly Route[], prefix: string, parent: Node): void {
  for (const r of routes) {
    if (r.outlet !== undefined || r.redirectTo !== undefined) continue;
    const path = r.path;
    if (path === undefined || path === '**') continue;
    const segments = splitSegments(path);
    if (segments.length === 0) {
      if (r.children && r.children.length > 0) {
        collect(r.children, prefix, parent);
      } else if (prefix === '') {
        child(parent, INDEX_KEY).pattern = '/';
      }
      continue;
    }
    let node = parent;
    let pattern = prefix;
    for (const segment of segments) {
      node = child(node, avoidReserved(segmentToKey(segment)));
      pattern = joinPattern(pattern, segment);
    }
    node.pattern = pattern;
    if (r.children && r.children.length > 0) {
      collect(r.children, pattern, node);
    }
  }
}

function child(parent: Node, key: string): Node {
  let node = parent.children.get(key);
  if (!node) {
    node = { children: new Map() };
    parent.children.set(key, node);
  }
  return node;
}

function materialize(node: Node): Record<string, unknown> {
  const children: Record<string, unknown> = {};
  for (const [key, c] of node.children) {
    children[key] = c.pattern === undefined ? materialize(c) : route(c.pattern, materialize(c));
  }
  return children;
}
