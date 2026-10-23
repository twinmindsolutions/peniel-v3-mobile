import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { IonIcon, IonRouterOutlet } from '@ionic/angular';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addIcons } from 'ionicons';
import { calendarOutline, homeOutline } from 'ionicons/icons';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';

@Component({
  selector: 'app-authenticated-shell',
  templateUrl: './authenticated-shell.component.html',
  styleUrl: './authenticated-shell.component.scss',
  imports: [IonIcon, IonRouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthenticatedShellComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly attendance = inject(AttendancePermissionService);
  readonly showNavigation = signal(this.isNavigationRoute(this.router.url));
  readonly showHeader = signal(!this.isHomeRoute(this.router.url));

  constructor() {
    addIcons({ calendarOutline, homeOutline });
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event) => {
      this.showNavigation.set(this.isNavigationRoute(event.urlAfterRedirects));
      this.showHeader.set(!this.isHomeRoute(event.urlAfterRedirects));
    });
  }

  private isNavigationRoute(url: string): boolean {
    return url.startsWith('/app/') && !url.startsWith('/app/workspace');
  }

  private isHomeRoute(url: string): boolean {
    return url === '/app/home' || url.startsWith('/app/home?');
  }
}
