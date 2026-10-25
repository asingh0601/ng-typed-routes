/**
 * Naming rules shared by the code generator (CLI) and the zero-codegen
 * runtime builder. Both must produce identical keys for the same routes.
 *
 * - a static segment becomes a camelCase identifier: `user-settings` -> `userSettings`
 * - a parameter segment becomes a `$`-prefixed identifier: `:id` -> `$id`
 * - an empty-path leaf route is called `index`
 * - keys that collide with members of a route object get a trailing `_`
 */

export const INDEX_KEY = 'index';

/** Property names that live on every route object and must not be shadowed by children. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'pattern',
  'paramNames',
  'outlet',
  'path',
  'ɵquery',
  'ɵdata',
]);

export function splitSegments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

export function isParamSegment(segment: string): boolean {
  return segment.startsWith(':');
}

export function paramNameOf(segment: string): string {
  return segment.slice(1).replace(/\)$/, '');
}

/** Converts a single URL segment into the property key used in the generated tree. */
export function segmentToKey(segment: string): string {
  if (isParamSegment(segment)) {
    return '$' + sanitizeIdentifier(paramNameOf(segment));
  }
  return sanitizeIdentifier(camelCase(segment));
}

export function camelCase(value: string): string {
  return value.replace(/[-_.\s]+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
}

export function sanitizeIdentifier(value: string): string {
  let id = value.replace(/[^A-Za-z0-9_$]/g, '_');
  if (id.length === 0) {
    id = '_';
  }
  if (/^[0-9]/.test(id)) {
    id = '_' + id;
  }
  return id;
}

export function avoidReserved(key: string): string {
  return RESERVED_KEYS.has(key) ? key + '_' : key;
}

/** Joins an absolute parent pattern and a child path into an absolute pattern. */
export function joinPattern(parent: string, path: string): string {
  const segments = splitSegments(path);
  if (segments.length === 0) {
    return parent === '' ? '/' : parent;
  }
  return (parent === '/' ? '' : parent) + '/' + segments.join('/');
}

/** Pattern for a route rendered into a named outlet, in Angular's URL syntax. */
export function outletPattern(parent: string, outlet: string, path: string): string {
  const base = parent === '' || parent === '/' ? '' : parent;
  return `${base}/(${outlet}:${splitSegments(path).join('/')})`;
}
