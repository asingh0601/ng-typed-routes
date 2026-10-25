import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  imports: [TypedLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>ng-typed-routes demo</h1>
    <p>Every link in this app is checked by the compiler.</p>
    <ul>
      <li><a [typedLink]="r.users">All users</a></li>
      <li><a [typedLink]="r.users.detail" [params]="{ id: 1 }">User 1</a></li>
      <li><a [typedLink]="r.users.detail.orders" [params]="{ id: 1 }" [query]="{ status: 'open' }">User 1, open orders</a></li>
    </ul>
    <p>Rename a route in <code>app.routes.ts</code>, run <code>npm run routes:generate</code>, and every stale link fails <code>ng build</code>.</p>
  `,
})
export class Home {
  protected readonly r = routes;
}
