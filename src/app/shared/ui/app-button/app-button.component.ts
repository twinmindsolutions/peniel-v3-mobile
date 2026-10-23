import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonButton, IonSpinner } from '@ionic/angular';

@Component({
  selector: 'app-button',
  templateUrl: './app-button.component.html',
  styleUrl: './app-button.component.scss',
  imports: [IonButton, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppButtonComponent {
  @Input() type: 'button' | 'submit' = 'button';
  @Input() variant: 'primary' | 'navy' | 'secondary' | 'ghost' = 'primary';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() expand: 'block' | 'full' | undefined = undefined;
}
