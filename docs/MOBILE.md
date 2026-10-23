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
flags remain authoritative. Workspace-scoped HTTP headers are intentionally deferred to M1.4E.
