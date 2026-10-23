import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AppButtonComponent } from '../../shared/ui/app-button/app-button.component';
import { WelcomeStateService } from '../../core/launch/welcome-state.service';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.page.html',
  styleUrl: './welcome.page.scss',
  imports: [IonContent, AppButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomePage {
  private readonly router = inject(Router);
  private readonly welcomeState = inject(WelcomeStateService);

  async getStarted(): Promise<void> {
    await this.welcomeState.complete();
    await this.router.navigateByUrl('/auth/login');
  }
}
