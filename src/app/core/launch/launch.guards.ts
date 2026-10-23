import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { WelcomeStateService } from './welcome-state.service';

async function launchDestination(auth: AuthService, welcome: WelcomeStateService): Promise<string> {
  await auth.initialize();
  if (auth.isAuthenticated()) {
    return '/app/home';
  }
  return (await welcome.hasCompleted()) ? '/auth/login' : '/welcome';
}

export const launchGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const welcome = inject(WelcomeStateService);
  const router = inject(Router);
  return launchDestination(auth, welcome).then((destination) => router.parseUrl(destination));
};

export const welcomeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const welcome = inject(WelcomeStateService);
  const router = inject(Router);
  await auth.initialize();
  if (auth.isAuthenticated()) {
    return router.parseUrl('/app/home');
  }
  return (await welcome.hasCompleted()) ? router.parseUrl('/auth/login') : true;
};

export const authEntryGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const welcome = inject(WelcomeStateService);
  const router = inject(Router);
  await auth.initialize();
  if (auth.isAuthenticated()) {
    return router.parseUrl('/app/home');
  }
  return (await welcome.hasCompleted()) ? true : router.parseUrl('/welcome');
};
