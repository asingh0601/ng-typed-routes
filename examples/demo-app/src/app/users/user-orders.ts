import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TypedRouter, injectParams, injectQuery } from 'ng-typed-routes';
import { routes } from '../routes.gen';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>Orders of user {{ id() }} — status: {{ status() ?? 'all' }}</p>
    <button type="button" (click)="filter('open')">Open</button>
    <button type="button" (click)="filter('shipped')">Shipped</button>
    <button type="button" (click)="filter(undefined)">All</button>
  `,
})
export class UserOrders {
  private readonly router = inject(TypedRouter);
  protected readonly id = injectParams(routes.users.detail.orders).id;
  protected readonly status = injectQuery(routes.users.detail.orders).status;

  protected filter(status: 'open' | 'shipped' | undefined): void {
    void this.router.navigate(routes.users.detail.orders, { id: this.id(), query: { status } });
  }
}
