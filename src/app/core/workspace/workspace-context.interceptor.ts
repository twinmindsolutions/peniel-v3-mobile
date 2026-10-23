import { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { ApiConfigService } from '../config/api-config.service';
import { WorkspaceAuthorizationService } from './workspace-authorization.service';
import { WorkspaceStateService } from './workspace-state.service';

const ORGANIZATION_HEADER = 'X-Organization-ID';
const BRANCH_HEADER = 'X-Branch-ID';

/** Adds validated workspace selectors; Django remains the authorization boundary. */
export const workspaceContextInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(ApiConfigService);
  const workspace = inject(WorkspaceStateService);
  const authorization = inject(WorkspaceAuthorizationService);
  const apiUrl = parseApiUrl(config.configuration.baseUrl);
  const requestUrl = parseRequestUrl(request.url, apiUrl);

  if (!requestUrl || requestUrl.origin !== apiUrl.origin || !isUnderBasePath(requestUrl.pathname, apiUrl.pathname)) return next(request);

  const relativePath = requestUrl.pathname.slice(apiUrl.pathname.length).replace(/^\/+/, '');
  if (isExcludedPath(relativePath, request.method)) return next(request);

  const organizationId = workspace.selectedOrganizationId();
  const branch = workspace.selectedBranch();
  if (!organizationId || (branch && branch.organization !== organizationId)) return next(request);

  const urlOrganizationId = organizationIdFromPath(relativePath);
  if (urlOrganizationId && urlOrganizationId !== organizationId) return next(request);

  const requestOrganizationId = request.headers.get(ORGANIZATION_HEADER);
  const requestBranchId = request.headers.get(BRANCH_HEADER);
  if (requestOrganizationId && requestOrganizationId !== organizationId) return next(request);
  if (requestBranchId && (!branch || requestBranchId !== branch.id)) return next(request);

  const headers: Record<string, string> = {};
  if (!requestOrganizationId) headers[ORGANIZATION_HEADER] = organizationId;
  if (branch && !requestBranchId) headers[BRANCH_HEADER] = branch.id;
  const scopedRequest = Object.keys(headers).length ? request.clone({ setHeaders: headers }) : request;
  const response = next(scopedRequest);
  if (!isRefreshableScopePath(relativePath, request.method)) return response;
  return response.pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || ![403, 404].includes(error.status)) {
        return throwError(() => error);
      }
      return from(authorization.refresh('authorization-failure')).pipe(
        switchMap(() => throwError(() => error)),
        catchError(() => throwError(() => error)),
      );
    }),
  );
};

interface ParsedApiUrl {
  readonly origin: string;
  readonly pathname: string;
}

function parseApiUrl(value: string): ParsedApiUrl {
  const url = new URL(value.replace(/\/$/, ''));
  return { origin: url.origin, pathname: url.pathname.replace(/\/$/, '') };
}

function parseRequestUrl(value: string, apiUrl: ParsedApiUrl): URL | null {
  try {
    return new URL(value, `${apiUrl.origin}${apiUrl.pathname}/`);
  } catch {
    return null;
  }
}

function isUnderBasePath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function isExcludedPath(relativePath: string, method: string): boolean {
  const normalizedPath = relativePath.replace(/\/+$/, '');
  if (/^auth\//.test(normalizedPath)) return true;
  if (method.toUpperCase() !== 'GET') return false;
  return normalizedPath === 'organizations'
    || /^organizations\/[^/]+\/branches$/.test(normalizedPath)
    || /^organizations\/[^/]+\/attendance\/capabilities$/.test(normalizedPath);
}

function isRefreshableScopePath(relativePath: string, method: string): boolean {
  return /^organizations\/[^/]+(?:\/|$)/.test(relativePath) && !isExcludedPath(relativePath, method);
}

function organizationIdFromPath(relativePath: string): string | null {
  const match = /^organizations\/([^/]+)(?:\/|$)/.exec(relativePath);
  return match?.[1] ?? null;
}
