import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonRouterOutlet } from '@ionic/angular';

@Component({
  selector: 'app-auth-shell',
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
  imports: [IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {}
