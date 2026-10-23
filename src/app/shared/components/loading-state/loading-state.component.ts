import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

@Component({
  selector: 'app-loading-state',
  templateUrl: './loading-state.component.html',
  styleUrl: './loading-state.component.scss',
  imports: [IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingStateComponent {
  @Input() message = 'Loading…';
}
