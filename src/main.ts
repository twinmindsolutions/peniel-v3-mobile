import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAppInitializer, inject } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthService } from './app/core/auth/auth.service';
import { authInterceptor } from './app/core/auth/auth.interceptor';
import { workspaceContextInterceptor } from './app/core/workspace/workspace-context.interceptor';
import { WorkspaceAuthorizationService } from './app/core/workspace/workspace-authorization.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideHttpClient(withInterceptors([authInterceptor, workspaceContextInterceptor])),
    provideAppInitializer(() => inject(AuthService).initialize()),
    provideAppInitializer(() => inject(WorkspaceAuthorizationService).initialize()),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
});
