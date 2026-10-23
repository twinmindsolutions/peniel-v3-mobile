import { Component, HostListener, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { businessOutline, calendarOutline, chevronForwardOutline, gitBranchOutline } from 'ionicons/icons';
import { AttendancePermissionService } from '../core/attendance/attendance-permission.service';
import { WorkspaceStateService } from '../core/workspace/workspace-state.service';
import { AppFeedbackStateComponent } from '../shared/ui/app-feedback-state/app-feedback-state.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonButton, IonContent, IonIcon, RouterLink, AppFeedbackStateComponent],
})
export class HomePage {
  readonly attendance = inject(AttendancePermissionService);
  readonly workspace = inject(WorkspaceStateService);
  readonly greeting = signal(greetingForHour(new Date().getHours()));

  constructor() {
    addIcons({ businessOutline, calendarOutline, chevronForwardOutline, gitBranchOutline });
  }

  ionViewWillEnter(): void {
    this.refreshGreeting();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.refreshGreeting();
    }
  }

  private refreshGreeting(): void {
    this.greeting.set(greetingForHour(new Date().getHours()));
  }
}

export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}
