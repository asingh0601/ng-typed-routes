import { describe, expect, it } from 'vitest';
import { buildPath, extractOutlet, extractParamNames, meta, route } from './types';
import { defineRoutes, typedRoutes } from './infer';

describe('route()', () => {
  it('exposes pattern, param names and children', () => {
    const r = route('/users/:id', { orders: route('/users/:id/orders') });
    expect(r.pattern).toBe('/users/:id');
    expect(r.paramNames).toEqual(['id']);
    expect(r.outlet).toBeUndefined();
    expect(r.orders.pattern).toBe('/users/:id/orders');
  });

  it('builds paths and encodes values', () => {
    const r = route('/users/:id/orders/:orderId');
    expect(r.path({ id: 1, orderId: 'a/b' })).toBe('/users/1/orders/a%2Fb');
    expect(route('/').path()).toBe('/');
    expect(route('/about').path()).toBe('/about');
  });

  it('throws on missing params at runtime', () => {
    const r = route('/users/:id');
    expect(() => buildPath(r.pattern, {})).toThrow(/Missing value for param ':id'/);
  });

  it('understands named-outlet patterns', () => {
    const r = route('/users/:id/(aux:chat/:room)');
    expect(extractOutlet(r.pattern)).toBe('aux');
    expect(extractParamNames(r.pattern)).toEqual(['id', 'room']);
    expect(r.path({ id: '1', room: 'x y' })).toBe('/users/1/(aux:chat/x%20y)');
    expect(route('/(aux:chat)').path()).toBe('/(aux:chat)');
  });

  it('meta() is empty at runtime', () => {
    expect(meta<{ query: { tab?: string } }>()).toEqual({});
  });
});

describe('typedRoutes() (zero-codegen mode)', () => {
  const appRoutes = defineRoutes([
    { path: '', children: [] },
    { path: 'about-us', children: [] },
    { path: 'users', children: [{ path: '', children: [] }, { path: ':id', children: [{ path: 'orders', children: [] }] }] },
    { path: 'admin/settings', children: [] },
    { path: 'chat', outlet: 'aux', children: [] },
    { path: 'old', redirectTo: 'about-us' },
    { path: '**', children: [] },
  ]);
  const routes = typedRoutes(appRoutes);

  it('mirrors the generator naming rules', () => {
    expect(routes.index.pattern).toBe('/');
    expect(routes.aboutUs.pattern).toBe('/about-us');
    expect(routes.users.pattern).toBe('/users');
    expect(routes.users.$id.pattern).toBe('/users/:id');
    expect(routes.users.$id.orders.pattern).toBe('/users/:id/orders');
    expect(routes.admin.settings.pattern).toBe('/admin/settings');
    expect(routes.users.$id.orders.path({ id: 3 })).toBe('/users/3/orders');
  });

  it('skips wildcards, redirects and named outlets', () => {
    const keys = Object.keys(routes);
    expect(keys).toEqual(['index', 'aboutUs', 'users', 'admin']);
  });
});
