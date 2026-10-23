import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonRouterOutlet } from '@ionic/angular';

@Component({
  selector: 'app-authenticated-shell',
  templateUrl: './authenticated-shell.component.html',
  styleUrl: './authenticated-shell.component.scss',
  imports: [IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthenticatedShellComponent {}
