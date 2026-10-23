import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ApiConfigService } from '../config/api-config.service';
import { WorkspaceStateService } from './workspace-state.service';
import { workspaceContextInterceptor } from './workspace-context.interceptor';

describe('workspaceContextInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  const selectedOrganizationId = signal<string | null>('org-1');
  const selectedBranch = signal<{ id: string; organization: string } | null>({ id: 'branch-1', organization: 'org-1' });

  beforeEach(() => {
    selectedOrganizationId.set('org-1');
    selectedBranch.set({ id: 'branch-1', organization: 'org-1' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([workspaceContextInterceptor])),
        provideHttpClientTesting(),
        { provide: ApiConfigService, useValue: { configuration: { baseUrl: 'https://api.test/api/v1' } } },
        { provide: WorkspaceStateService, useValue: { selectedOrganizationId, selectedBranch } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('adds validated organization and branch headers to an eligible API request', () => {
    http.get('https://api.test/api/v1/organizations/org-1/attendance/sessions/').subscribe();
    const request = controller.expectOne('https://api.test/api/v1/organizations/org-1/attendance/sessions/');
    expect(request.request.headers.get('X-Organization-ID')).toBe('org-1');
    expect(request.request.headers.get('X-Branch-ID')).toBe('branch-1');
    request.flush({});
  });

  it('excludes authentication and workspace discovery requests', () => {
    selectedOrganizationId.set('org-1');
    selectedBranch.set({ id: 'branch-1', organization: 'org-1' });
    for (const url of [
      'https://api.test/api/v1/auth/mobile/refresh/',
      'https://api.test/api/v1/organizations/',
      'https://api.test/api/v1/organizations',
      'https://api.test/api/v1/organizations/org-1/branches/',
      'https://api.test/api/v1/organizations/org-1/attendance/capabilities/',
    ]) {
      http.get(url).subscribe();
      const request = controller.expectOne(url);
      expect(request.request.headers.has('X-Organization-ID')).toBe(false);
      expect(request.request.headers.has('X-Branch-ID')).toBe(false);
      request.flush({});
    }
  });

  it('keeps discovery behavior unchanged before and after workspace selection', () => {
    selectedOrganizationId.set(null);
    selectedBranch.set(null);
    http.get('https://api.test/api/v1/organizations/').subscribe();
    const beforeSelection = controller.expectOne('https://api.test/api/v1/organizations/');
    expect(beforeSelection.request.headers.has('X-Organization-ID')).toBe(false);
    expect(beforeSelection.request.headers.has('X-Branch-ID')).toBe(false);
    beforeSelection.flush({});

    selectedOrganizationId.set('org-1');
    selectedBranch.set({ id: 'branch-1', organization: 'org-1' });
    http.get('https://api.test/api/v1/organizations/').subscribe();
    const afterSelection = controller.expectOne('https://api.test/api/v1/organizations/');
    expect(afterSelection.request.headers.has('X-Organization-ID')).toBe(false);
    expect(afterSelection.request.headers.has('X-Branch-ID')).toBe(false);
    afterSelection.flush({});
  });

  it('only treats GET discovery-shaped requests as discovery exclusions', () => {
    http.post('https://api.test/api/v1/organizations/', {}).subscribe();
    const request = controller.expectOne('https://api.test/api/v1/organizations/');
    expect(request.request.headers.has('X-Organization-ID')).toBe(true);
    expect(request.request.headers.has('X-Branch-ID')).toBe(true);
    request.flush({});
  });

  it('does not attach headers to another origin or organization', () => {
    for (const url of [
      'https://other.test/api/v1/organizations/org-1/members/',
      'https://api.test/api/v1/organizations/org-2/members/',
    ]) {
      http.get(url).subscribe();
      const request = controller.expectOne(url);
      expect(request.request.headers.has('X-Organization-ID')).toBe(false);
      expect(request.request.headers.has('X-Branch-ID')).toBe(false);
      request.flush({});
    }
  });

  it('does not overwrite conflicting explicit scope headers', () => {
    http.get('https://api.test/api/v1/organizations/org-1/members/', {
      headers: { 'X-Organization-ID': 'org-2', 'X-Branch-ID': 'branch-2' },
    }).subscribe();
    const request = controller.expectOne('https://api.test/api/v1/organizations/org-1/members/');
    expect(request.request.headers.get('X-Organization-ID')).toBe('org-2');
    expect(request.request.headers.get('X-Branch-ID')).toBe('branch-2');
    request.flush({});
  });

  it('uses the latest branch and stops adding headers after workspace clear', () => {
    selectedBranch.set({ id: 'branch-2', organization: 'org-1' });
    http.get('https://api.test/api/v1/organizations/org-1/members/').subscribe();
    const switched = controller.expectOne('https://api.test/api/v1/organizations/org-1/members/');
    expect(switched.request.headers.get('X-Branch-ID')).toBe('branch-2');
    switched.flush({});

    selectedOrganizationId.set(null);
    selectedBranch.set(null);
    http.get('https://api.test/api/v1/organizations/org-1/members/').subscribe();
    const cleared = controller.expectOne('https://api.test/api/v1/organizations/org-1/members/');
    expect(cleared.request.headers.has('X-Organization-ID')).toBe(false);
    expect(cleared.request.headers.has('X-Branch-ID')).toBe(false);
    cleared.flush({});
  });
});
