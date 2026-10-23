import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
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
        path: 'home',
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    canActivate: [launchGuard],
    children: [],
  },
  { path: '**', redirectTo: '' },
];
