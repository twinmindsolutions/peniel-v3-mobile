import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-card',
  templateUrl: './app-card.component.html',
  styleUrl: './app-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppCardComponent {}
