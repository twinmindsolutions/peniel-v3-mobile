import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-form-field',
  templateUrl: './app-form-field.component.html',
  styleUrl: './app-form-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppFormFieldComponent {
  @Input() label = '';
  @Input() error = '';
  @Input() hint = '';
  @Input() required = false;
  @Input() hasTrailingControl = false;
}
