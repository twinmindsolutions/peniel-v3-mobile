# Peniel Mobile

## Launch experience

The web launch route waits for authentication initialization before choosing a destination:

- first unauthenticated launch: `/welcome`
- returning signed-out launch: `/auth/login`
- authenticated launch: `/app/home`

The welcome completion flag is non-sensitive and stored with Capacitor Preferences. It is never
used for credentials; access tokens remain in memory and refresh credentials remain in the secure
credential store. Preference failures fall back to the login path after the user taps Get started
and never block authentication.

For browser development, Capacitor Preferences uses the `CapacitorStorage` group. The exact
completion key is `CapacitorStorage.peniel.welcome.completed`. To reset only the welcome screen
in browser devtools, run:

```js
localStorage.removeItem('CapacitorStorage.peniel.welcome.completed');
location.reload();
```

This removes no authentication credentials; refresh credentials are handled by the separate secure
credential store.

## Native splash

`capacitor.config.ts` prepares the Capacitor Splash Screen plugin with a deep navy background,
short automatic display, and no spinner. `src/assets/peniel-mark.svg` is the reusable Peniel mark
for the web welcome experience and future native asset generation.

Android and iOS platforms have not been added yet, so native splash asset packaging, launch timing,
safe-area behavior, and device appearance remain to be verified after platform setup. Do not treat
the browser build as native splash verification.

## Workspace discovery (M1.4B)

The mobile client now has typed, read-only `WorkspaceApiService` methods for the existing backend
contracts:

- `GET /api/v1/organizations/` returns an array of active organizations authorized for the
  authenticated user. Each organization includes identity, contact/timezone data, and the backend
  `capabilities` object.
- `GET /api/v1/organizations/{organization_id}/branches/` returns an array of active branches
  authorized within that organization.
- `GET /api/v1/organizations/{organization_id}/attendance/capabilities/` returns effective
  attendance permissions, authorized branch IDs, and attendance-officer group scopes.

`WorkspaceApiService` owns URL construction and typed HTTP calls. It does not manage tokens or
workspace selection. The existing Bearer interceptor remains responsible for authentication and
refresh behavior; HTTP authorization errors are propagated unchanged.

The current organization response exposes effective capabilities but not explicit role labels or
per-assignment metadata. The current branch response exposes authorized branches but not the role
that granted each branch. A later backend/API extension may expose authoritative role labels if the
mobile UX requires them; M1.4B does not invent labels client-side.

Approved next phases are separate: M1.4C adds workspace state and revalidation, M1.4D adds
organization/branch resolution UI, M1.4E adds scoped request headers, M1.4F integrates attendance
capabilities, and M1.4G handles assignment changes and stale-context recovery. No selection UI,
preference persistence, discovery-on-login, or workspace interceptor is implemented in M1.4B.

## Workspace state (M1.4C)

`WorkspaceStateService` owns the in-memory authorized workspace state using Angular signals. It tracks
authorized organizations, branches for the selected organization, selected IDs, attendance
capabilities, loading/error state, selection requirements, and whether a usable workspace has been
resolved.

Selections are accepted only when they match the latest backend discovery response. Selecting a new
organization clears the previous branch and dependent attendance capabilities. Authorization failures
remain represented as errors and are never converted into empty authorized collections. A request
generation counter rejects late organization, branch, or capability responses after a newer selection
or `clear()` call.

This phase is memory-only. M1.4C does not add route changes, selection screens, Capacitor Preferences,
workspace headers, or automatic discovery during authentication. M1.4D will add persistence and the
dedicated resolution flow; M1.4E–G will add scoped headers, capability-driven UI, and stale-context/
assignment-change recovery.

## Workspace resolution (M1.4D)

Authenticated users enter `/app/workspace` before `/app/home`. The resolution flow discovers
authorized organizations, validates a saved organization hint, loads its authorized active branches,
validates the saved branch hint, and loads attendance capabilities. A single organization or branch
is selected automatically; multiple choices are presented in the dedicated workspace page. Home is
guarded until a valid organization, branch, and capability response are present.

The selected IDs are stored only as non-sensitive Capacitor Preferences hints using user-scoped keys:
`peniel.workspace.{user_id}.organization` and `peniel.workspace.{user_id}.branch`. IDs are never
trusted without fresh backend discovery. Preference failures fall back to normal selection and do not
block authentication. Workspace state and in-flight resolution are invalidated on logout, session
revocation, or account change, preventing a different account from inheriting a prior selection.

The `/app/workspace` page displays only backend-returned organizations and branches, provides retry
and safe empty states, and keeps sign-out available. It does not invent role labels; backend capability
flags remain authoritative.

## Workspace-scoped HTTP requests (M1.4E)

`workspaceContextInterceptor` runs after the Bearer authentication interceptor. For requests to
the configured API origin and `/api/v1` path, it adds the currently validated
`X-Organization-ID` and, when a validated branch is selected, `X-Branch-ID`. It reads only the
in-memory `WorkspaceStateService` signals; it never reads workspace IDs from Preferences.

Authentication endpoints and workspace discovery requests (organization, branch, and attendance
capabilities discovery) are excluded. Requests whose organization URL does not match the selected
organization, requests to another origin, and requests carrying conflicting explicit scope headers
are passed through unchanged. Existing matching explicit headers are preserved.

These headers select a requested scope only. Django derives the authenticated principal and validates
organization and branch access before establishing transaction-local context; PostgreSQL RLS remains
the authorization boundary. The interceptor does not retry, translate, or suppress 401, 403, or 404
responses. Clearing or switching workspace state changes the headers on subsequent requests.

## Attendance permissions (M1.4F)

`AttendancePermissionService` is the reusable reactive UI permission layer for future attendance
features. It consumes only the current `WorkspaceStateService` signals and the backend's
`AttendanceCapabilities` response. Missing, stale, unresolved, or organization-mismatched
capabilities are denied by default.

The mapping is direct: `can_view_attendance` uses `view_branch_ids`; session management, recurring
schedules, annual generation, settings, and service types use their corresponding backend booleans
and branch ID lists; organization service types use `can_manage_organization_service_types`.
Ad-hoc creation requires the selected branch's `ad_hoc_scopes` entry. `selected_groups` permits only
its listed group IDs, while `all_compatible_groups` is the backend-defined unrestricted group scope.
An empty `selected_groups` list remains denied.

The service intersects capability flags with the currently discovered organization and branch, and
clears immediately when workspace state changes or is invalidated. These checks are for navigation
and UI availability only; every backend operation must revalidate authorization and RLS. M1.4G will
address capability-driven navigation and assignment-change recovery.

## Authorization refresh and recovery (M1.4G)

`WorkspaceAuthorizationService` coordinates single-flight authorization refreshes. Refreshes are
triggered when the app resumes, when the workspace screen is entered, and after relevant scoped
403/404 responses. Failed requests are not replayed, and ordinary 403/404 responses are preserved
for the caller.

Workspace resolution marks authorization unverified while refreshing. Attendance permissions therefore
fail closed during refresh or network failure instead of treating cached capabilities as newly
verified. Successful refreshes revalidate the saved organization and branch IDs against fresh
discovery data. Revoked or deactivated scopes are removed; valid alternative organizations or
branches remain available through the workspace screen. Logout and session invalidation clear the
workspace and invalidate pending refresh state.

401 responses remain authentication/session failures and continue through the existing AuthService
refresh flow. A 403 is treated as an operation-level permission denial unless refreshed discovery
shows the workspace is no longer available. A concealed 404 is treated as an unavailable resource;
it may trigger one bounded authorization refresh but never reveals whether a protected resource
exists. Network/server failures remain retryable errors and do not silently grant access.

The authenticated shell now provides a compact, safe-area-aware bottom navigation for Home and
Attendance. The Home tab is always available inside the protected shell; the Attendance tab is
rendered only when the resolved `AttendancePermissionService.canViewAttendance` signal allows it.
Workspace selection intentionally has no bottom navigation so the resolution flow remains focused.
The shell does not expose unimplemented modules, and the backend remains authoritative for every
attendance operation.

## Authenticated app shell (M2.UI.1)

After workspace resolution, authenticated feature routes share the Peniel shell header and a
persistent bottom navigation. Home displays the validated organization and branch, offers the
existing workspace-change route, and presents Attendance as the available quick-access module.
The shell uses the existing Peniel color, typography, card, and safe-area tokens; it does not add
fake metrics or cache workspace data. Logout, revocation, workspace switching, and authorization
refresh continue to be owned by the existing authentication and workspace services.

## Attendance sessions (M2.2)

The protected `/app/attendance` route lists the authorized sessions returned by
`GET /api/v1/organizations/{organization_id}/attendance/sessions/`. The response is the backend's
`{count, results}` shape and is not treated as paginated by the mobile client. Session details are
available at `/app/attendance/sessions/{session_id}` through the existing detail endpoint, with
registered-member-only metrics from the attendance-summary endpoint. No visitor, child, or total-
attendance metrics are invented by the client.

The mobile `AttendanceSessionApiService` is read-only and relies on the existing Bearer and
workspace-context interceptors. Attendance pages require an authenticated, resolved workspace and
use `AttendancePermissionService.canViewAttendance`; the page shows a safe no-access state without
calling protected session APIs when capability access is absent. Organization/branch changes clear
the rendered session data and late responses are ignored. The session list currently has no client
pagination because the backend collection is not server-paginated. Check-in, QR scanning, visitor/
child attendance, corrections, and offline synchronization remain future phases.

## Manual member check-in (M2.3)

Session details provide debounced, server-backed member search through
`GET /api/v1/organizations/{organization_id}/attendance/sessions/{session_id}/members/?search=...`.
The backend returns at most 25 eligible active members with `id`, `membership_number`,
`first_name`, and `last_name`. Selecting a result opens an explicit confirmation before the mobile
client calls `POST .../check-in/manual/` with `{ "member_id": "..." }`.

The response is the backend's exact `checked_in` or `already_checked_in` outcome and includes the
original record ID, server timestamp, method, and recording actor. Duplicate responses are shown as
already recorded and never reported as a new check-in. Successful or duplicate responses refresh the
read-only session summary. Failed writes are never retried automatically; an uncertain network
result tells the operator to refresh the session before trying again.

The backend currently has no separate recording capability flag. The UI derives a conservative
recording affordance from the existing effective session-management branch IDs or current ad-hoc
scope; the manual endpoint and SECURITY DEFINER function remain authoritative for Organization
Admins, Branch Admins, and scoped Attendance Officers. View-only users do not receive the action.
