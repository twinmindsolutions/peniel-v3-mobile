import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceStateService } from '../../core/workspace/workspace-state.service';
import { WorkspaceAuthorizationService } from '../../core/workspace/workspace-authorization.service';
import { WorkspacePage } from './workspace.page';

describe('WorkspacePage', () => {
  let fixture: ComponentFixture<WorkspacePage>;
  const workspace = {
    loading: vi.fn(() => false), error: vi.fn(() => null), organizations: vi.fn(() => []),
    branches: vi.fn(() => []), selectedOrganization: vi.fn(() => null), selectedBranch: vi.fn(() => null),
    organizationSelectionRequired: vi.fn(() => false), branchSelectionRequired: vi.fn(() => false),
    usableWorkspaceResolved: vi.fn(() => false),
    selectOrganization: vi.fn().mockResolvedValue(undefined), selectBranch: vi.fn(), clearBranchState: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspacePage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: vi.fn(() => ({ id: 'user-1' })), logout: vi.fn().mockResolvedValue(undefined) } },
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: WorkspaceAuthorizationService, useValue: { refresh: vi.fn().mockResolvedValue(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkspacePage);
  });

  it('resolves workspace state for the authenticated user on entry', () => {
    fixture.detectChanges();
    expect(TestBed.inject(WorkspaceAuthorizationService).refresh).toHaveBeenCalledWith('workspace-entry');
  });

  it('renders the no-authorized-workspace state without exposing workspace data', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No authorized workspace');
    expect(fixture.nativeElement.textContent).not.toContain('organization-uuid');
  });
});
