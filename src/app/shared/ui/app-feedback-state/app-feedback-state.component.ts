import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonSpinner } from '@ionic/angular';

@Component({
  selector: 'app-feedback-state',
  templateUrl: './app-feedback-state.component.html',
  styleUrl: './app-feedback-state.component.scss',
  imports: [IonButton, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppFeedbackStateComponent {
  @Input() title = '';
  @Input() message = '';
  @Input() kind: 'error' | 'loading' | 'empty' = 'error';
  @Input() retryLabel = 'Try again';
  @Output() retry = new EventEmitter<void>();
}
