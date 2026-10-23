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
