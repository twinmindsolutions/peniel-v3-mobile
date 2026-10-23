import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-shell',
  templateUrl: './app-page-shell.component.html',
  styleUrl: './app-page-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppPageShellComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() description = '';
}
