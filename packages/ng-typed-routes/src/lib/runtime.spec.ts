import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, RouterLinkActive, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { injectData, injectParams, injectQuery } from './inject';
import { TypedLinkDirective } from './typed-link.directive';
import { TypedRouter } from './typed-router';
import { meta, route } from './types';

// What the generator would emit for the Angular config below.
const routes = {
  index: route('/'),
  users: route('/users', {
    $id: route(
      '/users/:id',
      {
        orders: route('/users/:id/orders', {}, meta<{ query: { tab?: 'open' | 'closed'; page?: string } }>()),
      },
      meta<{ data: { title: string } }>(),
    ),
  }),
  aux: { chat: route('/(aux:chat)') },
};

@Component({ selector: 'test-home', template: 'home' })
class Home {}

@Component({ selector: 'test-user-detail', template: 'detail <router-outlet />', imports: [RouterOutlet] })
class UserDetail {
  readonly params = injectParams(routes.users.$id);
  readonly data = injectData(routes.users.$id);
}

@Component({ selector: 'test-user-orders', template: 'orders {{ id() }} {{ tab() }}' })
class UserOrders {
  readonly id = injectParams(routes.users.$id.orders).id;
  readonly query = injectQuery(routes.users.$id.orders);
  readonly tab = this.query.tab;
  readonly page = this.query.page;
}

@Component({ selector: 'test-chat', template: 'chat' })
class Chat {}

const angularRoutes = [
  { path: '', component: Home },
  {
    path: 'users',
    children: [
      {
        path: ':id',
        component: UserDetail,
        data: { title: 'User' },
        children: [{ path: 'orders', component: UserOrders }],
      },
    ],
  },
  { path: 'chat', outlet: 'aux', component: Chat },
];

describe('TypedRouter', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(angularRoutes), provideLocationMocks()] });
  });

  it('navigates with params, query and fragment', async () => {
    const typed = TestBed.inject(TypedRouter);
    const router = TestBed.inject(Router);
    await RouterTestingHarness.create();
    const ok = await typed.navigate(routes.users.$id.orders, { id: 42, query: { tab: 'open' }, fragment: 'top' });
    expect(ok).toBe(true);
    expect(router.url).toBe('/users/42/orders?tab=open#top');
  });

  it('builds URLs without navigating and merges query params', async () => {
    const typed = TestBed.inject(TypedRouter);
    await RouterTestingHarness.create();
    expect(typed.url(routes.users.$id, { id: 'a b' })).toBe('/users/a%20b');
    expect(typed.url(routes.index)).toBe('/');
    expect(typed.url(routes.aux.chat)).toBe('/(aux:chat)');

    await typed.navigate(routes.users.$id.orders, { id: 1, query: { tab: 'closed' } });
    expect(typed.url(routes.users.$id.orders, { id: 1, query: { page: '2' }, queryParamsHandling: 'merge' })).toBe(
      '/users/1/orders?tab=closed&page=2',
    );
    expect(typed.url(routes.users.$id.orders, { id: 1, queryParamsHandling: 'preserve' })).toBe('/users/1/orders?tab=closed');
    expect(typed.url(routes.users.$id.orders, { id: 1, query: { page: '2' } })).toBe('/users/1/orders?page=2');
  });

  it('reports active routes', async () => {
    const typed = TestBed.inject(TypedRouter);
    await RouterTestingHarness.create();
    await typed.navigate(routes.users.$id.orders, { id: 7 });
    expect(typed.isActive(routes.users.$id, { id: 7 })).toBe(true);
    expect(typed.isActive(routes.users.$id, { id: 7 }, true)).toBe(false);
    expect(typed.isActive(routes.users.$id.orders, { id: 7 }, true)).toBe(true);
    expect(typed.isActive(routes.users.$id, { id: 8 })).toBe(false);
    expect(typed.isActive(routes.index)).toBe(true); // '/' is a subset of everything
    expect(typed.isActive(routes.index, undefined, true)).toBe(false);
  });
});

describe('injectParams / injectQuery / injectData', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(angularRoutes), provideLocationMocks()] });
  });

  it('reads parent params from a child component and tracks changes', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/users/42/orders?tab=open', UserDetail);
    const orders = harness.routeDebugElement!.query(By.directive(UserOrders)).componentInstance as UserOrders;
    expect(orders.id()).toBe('42');
    expect(orders.tab()).toBe('open');
    expect(orders.page()).toBeUndefined();

    await harness.navigateByUrl('/users/43/orders?tab=closed&page=3');
    expect(orders.id()).toBe('43');
    expect(orders.tab()).toBe('closed');
    expect(orders.page()).toBe('3');
  });

  it('reads the route data', async () => {
    const harness = await RouterTestingHarness.create();
    const detail = await harness.navigateByUrl('/users/1', UserDetail);
    expect(detail.params.id()).toBe('1');
    expect(detail.data().title).toBe('User');
  });
});

describe('TypedLinkDirective', () => {
  @Component({
    imports: [TypedLinkDirective, RouterLinkActive, RouterOutlet],
    template: `
      <a id="plain" [typedLink]="r.index">home</a>
      <a id="params" [typedLink]="r.users.$id.orders" [params]="{ id: id() }" [query]="{ tab: 'open' }" routerLinkActive="active">orders</a>
      <a id="fragment" [typedLink]="r.users.$id" [params]="{ id: 2 }" fragment="bio">user</a>
      <a id="aux" [typedLink]="r.aux.chat">chat</a>
      <button id="btn" [typedLink]="r.users.$id" [params]="{ id: 9 }">go</button>
      <router-outlet />
    `,
  })
  class Host {
    readonly r = routes;
    readonly id = signal('5');
    readonly router = inject(Router);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(angularRoutes), provideLocationMocks()] });
  });

  it('renders hrefs from route, params and query', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#plain')!.getAttribute('href')).toBe('/');
    expect(el.querySelector('#params')!.getAttribute('href')).toBe('/users/5/orders?tab=open');
    expect(el.querySelector('#fragment')!.getAttribute('href')).toBe('/users/2#bio');
    expect(el.querySelector('#aux')!.getAttribute('href')).toBe('/(aux:chat)');
    expect(el.querySelector('#btn')!.getAttribute('tabindex')).toBe('0');
  });

  it('updates the href when a param signal changes', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.id.set('77');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#params').getAttribute('href')).toBe('/users/77/orders?tab=open');
  });

  it('navigates on click and cooperates with routerLinkActive', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('#params');
    link.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.router.url).toBe('/users/5/orders?tab=open');
    expect(link.classList.contains('active')).toBe(true);

    fixture.nativeElement.querySelector('#btn').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.router.url).toBe('/users/9');
    expect(link.classList.contains('active')).toBe(false);
  });
});
