import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { ApiConfigService } from '../config/api-config.service';
import { AuthService } from './auth.service';

export const AUTH_RETRY = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const config = inject(ApiConfigService);
  const apiBaseUrl = config.configuration.baseUrl.replace(/\/$/, '');

  if (!request.url.startsWith(`${apiBaseUrl}/`)) {
    return next(request);
  }

  const isAuthEndpoint = /\/auth\/mobile\/(login|refresh|logout)\/$/.test(request.url);
  const accessToken = auth.getAccessToken();
  const authenticatedRequest =
    !isAuthEndpoint && accessToken
      ? request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthEndpoint ||
        request.context.get(AUTH_RETRY)
      ) {
        return throwError(() => error);
      }
      return from(auth.refreshAccessToken()).pipe(
        switchMap((token) => {
          if (!token) {
            return throwError(() => error);
          }
          const retryContext = new HttpContext().set(AUTH_RETRY, true);
          return next(
            request.clone({
              context: retryContext,
              setHeaders: { Authorization: `Bearer ${token}` },
            }),
          );
        }),
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
