import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TypedRouter, injectParams, injectQuery } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Settings: {{ section() }}</h1>
    <p>Tab: {{ tab() ?? 'general' }}</p>
    <button type="button" (click)="switchTab('general')">General</button>
    <button type="button" (click)="switchTab('advanced')">Advanced</button>
  `,
})
export class Settings {
  private readonly router = inject(TypedRouter);
  protected readonly section = injectParams(routes.settings.$section).section;
  protected readonly tab = injectQuery(routes.settings.$section).tab;

  protected switchTab(tab: 'general' | 'advanced'): void {
    void this.router.navigate(routes.settings.$section, { section: this.section(), query: { tab } });
  }
}
