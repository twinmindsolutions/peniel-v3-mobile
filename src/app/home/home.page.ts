import { Component, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { AttendancePermissionService } from '../core/attendance/attendance-permission.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, EmptyStateComponent],
})
export class HomePage {
  readonly attendance = inject(AttendancePermissionService);
}
