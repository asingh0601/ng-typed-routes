/**
 * Type-level tests. Run with `vitest --typecheck` (see vitest.types.config.ts).
 * Every `@ts-expect-error` line is an assertion that the compiler rejects the code.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { injectParams, injectQuery } from './inject';
import { defineRoutes, typedRoutes } from './infer';
import { TypedLinkDirective, type TypedLinkInput } from './typed-link.directive';
import { TypedRouter } from './typed-router';
import { meta, route, type ParamName, type ParamsOf, type QueryOf, type TypedRoute } from './types';

const routes = {
  index: route('/'),
  users: route('/users', {
    $id: route(
      '/users/:id',
      { orders: route('/users/:id/orders/:orderId', {}, meta<{ query: { tab?: 'open' | 'closed'; page?: number } }>({ page: 'number' })) },
      meta<{ data: { title: string } }>(),
    ),
  }),
};

declare const typed: TypedRouter;
declare const user: { id: number; slug: string };

describe('pattern types', () => {
  it('extracts param names', () => {
    expectTypeOf<ParamName<'/users/:id/orders/:orderId'>>().toEqualTypeOf<'id' | 'orderId'>();
    expectTypeOf<ParamName<'/users'>>().toEqualTypeOf<never>();
    expectTypeOf<ParamName<'/users/:id/(aux:chat/:room)'>>().toEqualTypeOf<'id' | 'room'>();
  });

  it('derives params and query from a route', () => {
    expectTypeOf<ParamsOf<typeof routes.users.$id.orders>>().toEqualTypeOf<{ id: string | number; orderId: string | number }>();
    expectTypeOf<QueryOf<typeof routes.users.$id.orders>>().toEqualTypeOf<{ tab?: 'open' | 'closed'; page?: number }>();
    expectTypeOf<QueryOf<typeof routes.index>>().toEqualTypeOf<{}>();
  });
});

describe('path()', () => {
  it('requires exactly the declared params', () => {
    routes.users.$id.path({ id: user.id });
    routes.users.$id.orders.path({ id: '1', orderId: 2 });
    routes.index.path();
    // @ts-expect-error missing param
    routes.users.$id.path();
    // @ts-expect-error missing orderId
    routes.users.$id.orders.path({ id: '1' });
    // @ts-expect-error unknown param
    routes.users.$id.path({ id: '1', extra: 1 });
    // @ts-expect-error wrong type
    routes.users.$id.path({ id: true });
  });
});

describe('TypedRouter', () => {
  it('types navigate options', () => {
    void typed.navigate(routes.index);
    void typed.navigate(routes.users.$id, { id: 1 });
    void typed.navigate(routes.users.$id.orders, { id: 1, orderId: 'x', query: { tab: 'open' }, replaceUrl: true });
    // @ts-expect-error params required
    void typed.navigate(routes.users.$id);
    // @ts-expect-error unknown query key
    void typed.navigate(routes.users.$id.orders, { id: 1, orderId: 'x', query: { nope: 1 } });
    // @ts-expect-error wrong query value
    void typed.navigate(routes.users.$id.orders, { id: 1, orderId: 'x', query: { tab: 'pending' } });
  });
});

describe('injectParams / injectQuery', () => {
  it('returns one signal per param', () => {
    const p = injectParams(routes.users.$id.orders);
    expectTypeOf(p.id).toEqualTypeOf<Signal<string>>();
    expectTypeOf(p.orderId).toEqualTypeOf<Signal<string>>();
    // @ts-expect-error unknown param
    void p.nope;
    const q = injectQuery(routes.users.$id.orders);
    expectTypeOf(q.tab).toEqualTypeOf<Signal<'open' | 'closed' | undefined>>();
    expectTypeOf(q.page).toEqualTypeOf<Signal<number | undefined>>();
  });
});

describe('TypedLinkInput (what [typedLink] resolves to in templates)', () => {
  type Detail = typeof routes.users.$id;
  it('accepts the route when params match, rejects it otherwise', () => {
    expectTypeOf<TypedLinkInput<Detail, { id: string }>>().toEqualTypeOf<Detail>();
    expectTypeOf<TypedLinkInput<Detail, { id: number }>>().toEqualTypeOf<Detail>();
    expectTypeOf<TypedLinkInput<typeof routes.index, any>>().toEqualTypeOf<typeof routes.index>();
    // Angular passes `any` for an unset input: the route must no longer be assignable.
    expectTypeOf<Detail>().not.toMatchTypeOf<TypedLinkInput<Detail, any>>();
    expectTypeOf<Detail>().not.toMatchTypeOf<TypedLinkInput<Detail, { idd: string }>>();
    expectTypeOf<Detail>().not.toMatchTypeOf<TypedLinkInput<Detail, { id: string; extra: 1 }>>();
    expectTypeOf<Detail>().not.toMatchTypeOf<TypedLinkInput<Detail, {}>>();
  });
  it('directive generics exist', () => {
    expectTypeOf<TypedLinkDirective<Detail, { id: string }>>().toHaveProperty('typedLink');
  });
});

describe('zero-codegen mode', () => {
  const appRoutes = defineRoutes([
    { path: '', children: [] },
    { path: 'user-settings', children: [] },
    { path: 'users', children: [{ path: '', children: [] }, { path: ':id', children: [{ path: 'orders', children: [] }] }] },
    { path: 'admin/reports/:year', children: [] },
    { path: '**', children: [] },
  ]);
  const r = typedRoutes(appRoutes);

  it('stays assignable to Angular Routes', () => {
    expectTypeOf(appRoutes).toMatchTypeOf<Routes>();
  });

  it('infers the same tree as the generator', () => {
    expectTypeOf(r.index.pattern).toEqualTypeOf<'/'>();
    expectTypeOf(r.userSettings.pattern).toEqualTypeOf<'/user-settings'>();
    expectTypeOf(r.users.pattern).toEqualTypeOf<'/users'>();
    expectTypeOf(r.users.$id.pattern).toEqualTypeOf<'/users/:id'>();
    expectTypeOf(r.users.$id.orders.pattern).toEqualTypeOf<'/users/:id/orders'>();
    expectTypeOf(r.admin.reports.$year.pattern).toEqualTypeOf<'/admin/reports/:year'>();
    r.users.$id.orders.path({ id: 1 });
    // @ts-expect-error missing param
    r.users.$id.orders.path({});
    // @ts-expect-error wildcard is not a route
    void r['**'];
  });
});

describe('TypedRoute', () => {
  it('is just a Route with phantom metadata', () => {
    const r = { path: 'x' } satisfies TypedRoute<{ query: { a?: string } }>;
    expectTypeOf(r).toMatchTypeOf<{ path: string }>();
  });
});
