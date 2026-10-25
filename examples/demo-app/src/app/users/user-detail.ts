import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLinkActive, RouterOutlet } from '@angular/router';
import { TypedLinkDirective, injectParams } from 'ng-typed-routes';
import { routes } from '../routes.gen';

@Component({
  imports: [RouterOutlet, RouterLinkActive, TypedLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>User {{ id() }}</h1>
    <nav>
      <a [typedLink]="r.users.detail.profile" [params]="{ id: id() }" routerLinkActive="active">Profile</a>
      <a [typedLink]="r.users.detail.orders" [params]="{ id: id() }" routerLinkActive="active">Orders</a>
      <a [typedLink]="r.users">Back</a>
    </nav>
    <router-outlet />
  `,
})
export class UserDetail {
  protected readonly r = routes;
  protected readonly id = injectParams(routes.users.detail).id;
}
