import { Routes } from '@angular/router';
import { authGuard, workspaceGuard } from './core/auth/auth.guard';
import { authEntryGuard, launchGuard, welcomeGuard } from './core/launch/launch.guards';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./shared/layouts/auth-shell/auth-shell.component').then((m) => m.AuthShellComponent),
    children: [
      {
        path: 'login',
        canActivate: [authEntryGuard],
        loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: 'welcome',
    canActivate: [welcomeGuard],
    loadComponent: () => import('./features/welcome/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layouts/authenticated-shell/authenticated-shell.component').then((m) => m.AuthenticatedShellComponent),
    children: [
      {
        path: 'workspace',
        loadComponent: () => import('./features/workspace/workspace.page').then((m) => m.WorkspacePage),
      },
      {
        path: 'home',
        canActivate: [workspaceGuard],
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      { path: '', redirectTo: 'workspace', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    canActivate: [launchGuard],
    children: [],
  },
  { path: '**', redirectTo: '' },
];
