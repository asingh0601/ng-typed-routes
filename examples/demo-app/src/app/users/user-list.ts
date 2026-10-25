import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from '../routes.gen';

@Component({
  imports: [TypedLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Users</h1>
    <ul>
      @for (user of users(); track user.id) {
        <li>
          <a [typedLink]="r.users.detail" [params]="{ id: user.id }">{{ user.name }}</a>
        </li>
      }
    </ul>
  `,
})
export class UserList {
  protected readonly r = routes;
  protected readonly users = signal([
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
    { id: 3, name: 'Linus' },
  ]);
}
