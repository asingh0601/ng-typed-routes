import type { AnalyzedRoute } from './analyzer.js';
import {
  INDEX_KEY,
  avoidReserved,
  camelCase,
  joinPattern,
  outletPattern,
  sanitizeIdentifier,
  segmentToKey,
  splitSegments,
} from '../src/lib/naming.js';

/** A node of the named tree that the emitter prints. */
export interface TreeNode {
  /** Absolute pattern when this node is a navigable route; undefined for a pure group. */
  pattern?: string;
  outlet?: string;
  queryType?: string;
  queryCodec?: Record<string, string>;
  dataType?: string;
  source?: string;
  children: Map<string, TreeNode>;
}

export interface BuildResult {
  root: TreeNode;
  warnings: string[];
  /** Number of navigable routes in the tree. */
  routeCount: number;
}

/**
 * Turns the analyzed routes into the named tree:
 * - empty-path routes with children are transparent (children hoisted)
 * - empty-path leaves become `index`
 * - `**` and redirects are not navigation targets and are skipped
 * - multi-segment paths nest one level per segment
 * - named outlets nest under a group named after the outlet
 */
export function buildTree(routes: AnalyzedRoute[]): BuildResult {
  const root: TreeNode = { children: new Map() };
  const warnings: string[] = [];
  const counter = { count: 0 };
  collect(routes, '', root, warnings, counter);
  return { root, warnings, routeCount: counter.count };
}

function collect(
  routes: AnalyzedRoute[],
  prefix: string,
  parent: TreeNode,
  warnings: string[],
  counter: { count: number },
): void {
  for (const r of routes) {
    if (r.path === '**') {
      if (r.children.length) warnings.push(`${r.source}: children of a '**' route are not generated.`);
      continue;
    }
    if (r.redirectTo) continue;

    const segments = splitSegments(r.path);

    if (r.outlet !== undefined) {
      const group = child(parent, avoidReserved(sanitizeIdentifier(camelCase(r.outlet))));
      const pattern = outletPattern(prefix, r.outlet, r.path);
      const node = r.name
        ? child(group, avoidReserved(sanitizeIdentifier(r.name)))
        : descend(group, segments.length ? segments : [INDEX_KEY]);
      assign(node, pattern, r, warnings, counter);
      node.outlet = r.outlet;
      if (r.children.length > 0) collect(r.children, pattern, node, warnings, counter);
      continue;
    }

    if (segments.length === 0) {
      if (r.children.length > 0) {
        if (r.name) warnings.push(`${r.source}: 'name' on an empty-path route with children is ignored.`);
        collect(r.children, prefix, parent, warnings, counter);
      } else if (parent.pattern !== undefined && !r.name) {
        // `{ path: '' }` inside a navigable parent: the parent already is this URL.
        // Only its declared query/data are worth keeping.
        parent.queryType ??= r.queryType;
        parent.queryCodec ??= r.queryCodec;
        parent.dataType ??= r.dataType;
      } else {
        const node = child(parent, r.name ? avoidReserved(sanitizeIdentifier(r.name)) : INDEX_KEY);
        assign(node, prefix === '' ? '/' : prefix, r, warnings, counter);
      }
      continue;
    }

    let pattern = prefix;
    for (const segment of segments) pattern = joinPattern(pattern, segment);
    const node = r.name ? child(parent, avoidReserved(sanitizeIdentifier(r.name))) : descend(parent, segments);
    assign(node, pattern, r, warnings, counter);
    if (r.children.length > 0) {
      collect(r.children, pattern, node, warnings, counter);
    }
  }
}

function descend(parent: TreeNode, segments: string[]): TreeNode {
  let node = parent;
  for (const segment of segments) {
    node = child(node, avoidReserved(segmentToKey(segment)));
  }
  return node;
}

function child(parent: TreeNode, key: string): TreeNode {
  let node = parent.children.get(key);
  if (!node) {
    node = { children: new Map() };
    parent.children.set(key, node);
  }
  return node;
}

function assign(node: TreeNode, pattern: string, r: AnalyzedRoute, warnings: string[], counter: { count: number }): void {
  if (node.pattern !== undefined) {
    if (node.pattern !== pattern) {
      warnings.push(`${r.source}: route key collides with '${node.pattern}' (from ${node.source}); keeping the first.`);
    } else {
      warnings.push(`${r.source}: duplicate route '${pattern}' (also at ${node.source}); keeping the first.`);
    }
    return;
  }
  node.pattern = pattern;
  node.source = r.source;
  node.queryType = r.queryType;
  node.queryCodec = r.queryCodec;
  node.dataType = r.dataType;
  counter.count++;
}
