import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';
import { WorkspaceApiService } from './workspace-api.service';
import { AttendanceCapabilities, BranchContext, OrganizationContext } from './workspace.models';

export interface WorkspaceErrorState {
  readonly status: number | null;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  private readonly api = inject(WorkspaceApiService);
  private requestVersion = 0;
  private activeUserId: string | null = null;
  private resolvedUserId: string | null = null;
  private resolutionPromise: Promise<void> | undefined;

  private readonly organizationsSignal = signal<readonly OrganizationContext[]>([]);
  private readonly branchesSignal = signal<readonly BranchContext[]>([]);
  private readonly selectedOrganizationIdSignal = signal<string | null>(null);
  private readonly selectedBranchIdSignal = signal<string | null>(null);
  private readonly attendanceCapabilitiesSignal = signal<AttendanceCapabilities | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<WorkspaceErrorState | null>(null);
  private readonly authorizationVerifiedSignal = signal(false);

  readonly organizations = this.organizationsSignal.asReadonly();
  readonly branches = this.branchesSignal.asReadonly();
  readonly selectedOrganizationId = this.selectedOrganizationIdSignal.asReadonly();
  readonly selectedBranchId = this.selectedBranchIdSignal.asReadonly();
  readonly attendanceCapabilities = this.attendanceCapabilitiesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly authorizationVerified = this.authorizationVerifiedSignal.asReadonly();

  readonly selectedOrganization = computed(() => {
    const id = this.selectedOrganizationIdSignal();
    return this.organizationsSignal().find((organization) => organization.id === id) ?? null;
  });

  readonly selectedBranch = computed(() => {
    const id = this.selectedBranchIdSignal();
    return this.branchesSignal().find((branch) => branch.id === id) ?? null;
  });

  readonly organizationSelectionRequired = computed(() => this.organizationsSignal().length > 1);
  readonly branchSelectionRequired = computed(() => this.branchesSignal().length > 1);
  readonly usableWorkspaceResolved = computed(() => (
    this.selectedOrganization() !== null
    && this.selectedBranch() !== null
    && this.attendanceCapabilitiesSignal() !== null
  ));

  async loadAuthorizedOrganizations(): Promise<void> {
    const version = this.beginLoad();
    try {
      const organizations = await firstValueFrom(this.api.getOrganizations());
      if (!this.isCurrent(version)) return;

      this.organizationsSignal.set(organizations);
      this.branchesSignal.set([]);
      this.selectedBranchIdSignal.set(null);
      this.attendanceCapabilitiesSignal.set(null);
      if (organizations.length === 1) {
        await this.selectOrganization(organizations[0].id);
      } else {
        this.selectedOrganizationIdSignal.set(null);
      }
    } catch (error: unknown) {
      if (this.isCurrent(version)) this.setError(error);
      throw error;
    } finally {
      if (this.isCurrent(version)) this.loadingSignal.set(false);
    }
  }

  resolveForUser(userId: string, force = false): Promise<void> {
    if (!force && this.resolvedUserId === userId) {
      return Promise.resolve();
    }
    if (!force && this.activeUserId === userId && this.resolutionPromise) {
      return this.resolutionPromise;
    }

    this.activeUserId = userId;
    const promise = this.resolveWorkspace(userId).finally(() => {
      if (this.resolutionPromise === promise) this.resolutionPromise = undefined;
    });
    this.resolutionPromise = promise;
    return promise;
  }

  async selectOrganization(organizationId: string): Promise<void> {
    const organization = this.organizationsSignal().find((item) => item.id === organizationId);
    if (!organization) throw new Error('The selected organization is not authorized.');

    this.requestVersion += 1;
    this.errorSignal.set(null);
    this.selectedOrganizationIdSignal.set(organization.id);
    this.clearBranchState();
    await this.savePreference(organization.id, 'organization');
    await this.loadBranchesForSelectedOrganization();
    if (this.selectedOrganizationIdSignal() === organization.id) {
      await this.loadAttendanceCapabilities();
    }
  }

  async loadBranchesForSelectedOrganization(): Promise<void> {
    const organizationId = this.selectedOrganizationIdSignal();
    if (!organizationId) {
      this.clearBranchState();
      return;
    }

    const version = this.beginLoad();
    try {
      const branches = await firstValueFrom(this.api.getBranches(organizationId));
      if (!this.isCurrent(version)) return;
      this.branchesSignal.set(branches);
      this.selectedBranchIdSignal.set(branches.length === 1 ? branches[0].id : null);
    } catch (error: unknown) {
      if (this.isCurrent(version)) {
        this.branchesSignal.set([]);
        this.selectedBranchIdSignal.set(null);
        this.setError(error);
      }
      throw error;
    } finally {
      if (this.isCurrent(version)) this.loadingSignal.set(false);
    }
  }

  selectBranch(branchId: string): void {
    const branch = this.branchesSignal().find((item) => item.id === branchId);
    if (!branch || branch.organization !== this.selectedOrganizationIdSignal()) {
      throw new Error('The selected branch is not authorized.');
    }
    this.errorSignal.set(null);
    this.selectedBranchIdSignal.set(branch.id);
    void this.savePreference(branch.id, 'branch');
  }

  async loadAttendanceCapabilities(): Promise<void> {
    const organizationId = this.selectedOrganizationIdSignal();
    if (!organizationId) {
      this.attendanceCapabilitiesSignal.set(null);
      return;
    }

    const version = this.beginLoad();
    try {
      const capabilities = await firstValueFrom(this.api.getAttendanceCapabilities(organizationId));
      if (this.isCurrent(version)) this.attendanceCapabilitiesSignal.set(capabilities);
    } catch (error: unknown) {
      if (this.isCurrent(version)) {
        this.attendanceCapabilitiesSignal.set(null);
        this.setError(error);
      }
      throw error;
    } finally {
      if (this.isCurrent(version)) this.loadingSignal.set(false);
    }
  }

  async refreshAuthorization(): Promise<void> {
    if (!this.activeUserId) return;
    if (this.resolutionPromise) {
      await this.resolutionPromise;
      return;
    }
    await this.resolveForUser(this.activeUserId, true);
  }

  clearBranchState(): void {
    this.requestVersion += 1;
    this.branchesSignal.set([]);
    this.selectedBranchIdSignal.set(null);
    this.attendanceCapabilitiesSignal.set(null);
  }

  clearOrganizationSelection(): void {
    this.requestVersion += 1;
    this.selectedOrganizationIdSignal.set(null);
    this.clearBranchState();
    this.errorSignal.set(null);
  }

  clear(): void {
    this.requestVersion += 1;
    this.organizationsSignal.set([]);
    this.clearBranchState();
    this.selectedOrganizationIdSignal.set(null);
    this.errorSignal.set(null);
    this.loadingSignal.set(false);
    this.authorizationVerifiedSignal.set(false);
    this.activeUserId = null;
    this.resolvedUserId = null;
    this.resolutionPromise = undefined;
  }

  private async resolveWorkspace(userId: string): Promise<void> {
    this.resolvedUserId = null;
    this.authorizationVerifiedSignal.set(false);
    const savedOrganizationId = await this.readPreference(userId, 'organization');
    const savedBranchId = await this.readPreference(userId, 'branch');
    if (this.activeUserId !== userId) return;

    await this.loadAuthorizedOrganizations();
    if (this.activeUserId !== userId) return;

    if (savedOrganizationId && this.organizationsSignal().some((item) => item.id === savedOrganizationId)) {
      if (this.selectedOrganizationIdSignal() !== savedOrganizationId) {
        await this.selectOrganization(savedOrganizationId);
      }
    }
    if (this.activeUserId !== userId) return;

    if (savedBranchId && this.branchesSignal().some((item) => item.id === savedBranchId)) {
      this.selectBranch(savedBranchId);
    }
    this.resolvedUserId = userId;
    this.authorizationVerifiedSignal.set(true);
  }

  private async readPreference(userId: string, scope: 'organization' | 'branch'): Promise<string | null> {
    try {
      return (await Preferences.get({ key: this.preferenceKey(userId, scope) })).value;
    } catch {
      return null;
    }
  }

  private async savePreference(value: string, scope: 'organization' | 'branch'): Promise<void> {
    if (!this.activeUserId) return;
    try {
      await Preferences.set({ key: this.preferenceKey(this.activeUserId, scope), value });
    } catch {
      // Workspace persistence is a convenience and must not block authentication.
    }
  }

  private preferenceKey(userId: string, scope: 'organization' | 'branch'): string {
    return `peniel.workspace.${userId}.${scope}`;
  }

  private beginLoad(): number {
    const version = ++this.requestVersion;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    return version;
  }

  private isCurrent(version: number): boolean {
    return version === this.requestVersion;
  }

  private setError(error: unknown): void {
    this.errorSignal.set({
      status: error instanceof HttpErrorResponse ? error.status : null,
      message: error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)
        ? 'This workspace is no longer available.'
        : 'We could not load your authorized workspace. Please try again.',
    });
  }
}
