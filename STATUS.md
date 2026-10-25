# Technothera Dismissal native app: status

**One** Capacitor store app — "Technothera Dismissal" (`com.technothera.dismissal`) — that both
staff and parent accounts log into. Role is resolved after login, the same way the web app does
it, and the app routes to that role's screens. Admin, superadmin and display are unchanged and
are still web-only.

This supersedes an earlier design built as two separate store apps ("Finnly Staff" / "Finnly
Parent"), each locked to one role at build time. That design was reworked into this one before
anything was submitted anywhere, for two reasons: (1) a single binary with runtime role routing
is simpler to maintain and ship, and (2) "Finnly" is one customer nursery on this multi-tenant
platform, not the product — the app's own identity (name, bundle ID, icon) must stay generic so
every nursery's staff/parents can install the same app.

Work was done in a clone of `D:\Old D\finnly-dismissal` (HEAD `2317b02`). The original folder was
only read from, never written to.

---

## 1. What to do next (in order)

Nothing below has been done on your behalf. Each item needs your accounts or your decision.

1. **Firebase (Android push).** Create a Firebase project. Add one Android app:
   `com.technothera.dismissal`. Download `google-services.json` and place it at
   `native/android/app/google-services.json`. This file is configuration for your Firebase
   project, so keep it out of git (`.gitignore` already excludes it). Without it, the Android
   build succeeds but push does not work.
2. **Firebase service account.** In Project settings → Service accounts, generate a new private
   key. Set the whole JSON as the Supabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`.
3. **Apple APNs key.** In the Apple Developer account, create a key with the Apple Push
   Notifications service (APNs) capability. Download the `.p8` file once; Apple does not show it
   again. Set these Supabase secrets:
   - `APNS_AUTH_KEY`: the full contents of the `.p8` file.
   - `APNS_KEY_ID`: the 10-character Key ID.
   - `APNS_TEAM_ID`: your 10-character Team ID.
   - `APNS_USE_SANDBOX`: `true` only if you test with Xcode debug builds. Leave it unset for
     TestFlight and App Store builds.
4. **Apple app ID.** Register the bundle ID `com.technothera.dismissal` in the Apple Developer
   portal. Enable the Push Notifications capability.
5. **Xcode, on a Mac (or via the CI workflow).**
   - Add `native/ios/App/App/sounds/dismissal_alert.wav` to the App target's resources. It is
     copied to disk but not yet referenced in the Xcode project.
   - In Signing & Capabilities, add Push Notifications and select your team.
6. **Apply the migration and deploy the functions.** Review
   `supabase/migrations/20261006000000_device_push_tokens.sql`, then run `supabase db push` and
   `supabase functions deploy notify-parent notify-staff` yourself. Nothing here applies them.
7. ~~Real app icon.~~ Done — you dropped a 1254×1254 opaque icon at the repo root
   (`logo,png`) partway through this work; it's now `native/resources/icon.png`, and
   `npx @capacitor/assets generate --android --ios` has been re-run with it. The old
   placeholder splash screen (which read "Finnly / Cross The Finnish Line" — see section 2) was
   replaced with a plain background-color splash, since no generic splash artwork exists yet.
   Say the word if you want the icon centered on the splash screen too, or different
   light/dark background colors than the `#EAE5DF` / `#0B1120` placeholders used here.
8. **Store accounts** (see section 7).
9. **Reconcile this clone into `dismissal-system` on GitHub, and deploy the web-codebase changes
   to production** (see sections 9 and 10 below) — needed before any of this can actually work
   against the live site.

---

## 2. Decisions and why

| Topic | Decision | Reason |
|---|---|---|
| One app vs. two | Single Capacitor project, single app ID, runtime role routing after login | Simpler to build, sign and ship than two binaries; matches how the web app already resolves role. Changed from an earlier two-app design before any submission. |
| App identity | Bundle ID `com.technothera.dismissal`, display name "Technothera Dismissal" | "Finnly" is one customer nursery, not the product — using it as the app's own name/ID would look wrong to every other nursery downloading the same app. A separate consumer-facing sub-brand name (not yet finalized) can be set later in store listings without touching the bundle ID. |
| Nursery code | Typed slug, entered once on first launch | Admin has no QR code anywhere (`qrcode` is a dev dependency, `qr-installing.png` is unreferenced). A typed code needs no second device. The code is the existing tenant slug, so `/api/nursery?slug=` is reused unchanged. |
| Code storage | Capacitor Preferences (`finnly_nursery_slug`) | Survives restarts, so branding and the login screen load before sign-in. (Storage key name is unchanged from the earlier design — it's an internal Preferences key, not user-visible, and renaming it would orphan existing stored values for no benefit.) |
| API base | `https://technothera.com` in native builds only (`VITE_API_BASE_URL`) | Capacitor's WebView origin is not the website, so relative `/api` calls would fail. Web builds keep relative paths. |
| CORS | `/api/nursery` allows `capacitor://localhost`, `https://localhost`, `http://localhost`, and sends `Vary: Origin` | Only the nursery lookup is called cross-origin by the store app. Other `/api` routes are web-only and unchanged. |
| Route scoping | Runtime role resolution. Native build mounts both `/staff` and `/parent` routes; after login, the existing `ROLE_REDIRECTS`-style logic sends the user to their own role's route. A non-staff/parent account (admin, superadmin, display) sees a "This app is for staff and parent accounts" screen with sign-out. | Matches the web app's behavior exactly instead of a second, build-locked mechanism. The backend still enforces real access (RLS), so this is UX scoping, not security. |
| Per-app config | `scripts/build-native.mjs` sets the app ID and API base in code | `.env*` is gitignored, and these values have to be committed. There's now only one app, so no per-app branching. |
| Push token table | `device_push_tokens`, one row per device. Writes go through `claim_device_push_token` and `release_device_push_token` (security definer). | A device handed to another account is re-claimed, the same rule Web Push uses. RLS on the table alone cannot allow that. |
| `app_id` column | Kept on the table even though there's one app now | APNs needs the bundle ID as the topic, and keeping it per-row (rather than hardcoding one app ID in the Edge Function) costs nothing and survives a future bundle ID change without a migration. |
| Web Push | Unchanged. Native sends run first and never throw. | The brief says Web Push must keep working. A missing native credential logs and skips. |
| Android channel | `dismissal_alerts`, importance MAX, sound `dismissal_alert`, vibration | This is the heads-up, audible notification the brief asks for. Channel settings are locked by Android after creation, so they are set on the client. Renamed from `finnly_alerts`/`finnly_alert` along with the rest of the app's identity — these are internal identifiers (never shown to a user), but keeping "Finnly" out of anything shipped in the binary avoided a later cleanup. |
| Sound file | Generated two-tone WAV (`dismissal_alert.wav`) | Placeholder. Replace with a brand sound if wanted. |
| Service worker | Not registered in native builds. PWA install banner hidden. | Service workers do not belong inside a WebView. |

---

## 3. What was built

### Client (`src/`)
- `src/native/platform.js`: `isNative`, `apiUrl()`. (No build-time `APP_ROLE` anymore — role is
  read from the signed-in user at runtime, same as the web app.)
- `src/native/nurseryStorage.js`: stored nursery code.
- `src/native/push.js`: permission prompt, Android channel, token registration and claim, release
  on sign-out. App ID is now the single constant `com.technothera.dismissal`.
- `src/components/NurseryCodeScreen.jsx`: first-launch code entry.
- `src/hooks/useTenant.jsx`: on native, reads the stored code. Shows the code screen when none is
  stored. Exposes `submitNurseryCode`.
- `src/App.jsx`: for native builds, mounts `/staff` and `/parent` (not admin/superadmin/display),
  and a root redirect that sends a signed-in user to their own role's route — reusing the same
  `ProtectedRoute`/`LicenseGate` wrappers the web app uses. A signed-in admin/superadmin/display
  account sees a "wrong app" screen with sign-out, same idea as before but no longer tied to a
  build-locked role.
- `src/main.jsx`: service worker skipped on native.
- `src/interfaces/staff/StaffApp.jsx`, `src/interfaces/parent/ParentApp.jsx`: release push token
  before sign-out.
- `src/interfaces/feedback/FeedbackForm.jsx`, `src/interfaces/superadmin/NurseryAnalyticsDetail.jsx`,
  `src/interfaces/superadmin/OrganizationDetail.jsx`: `/api` calls go through `apiUrl()`. Behavior
  on web is unchanged.

### Backend
- **Migration:** `supabase/migrations/20261006000000_device_push_tokens.sql`. Additive only.
  Creates `device_push_tokens`, RLS (read and delete own rows), and two security-definer
  functions. Not applied. (Comments updated to drop the two-app framing; no schema change — the
  table never hardcoded bundle IDs.)
- **Shared sender:** `supabase/functions/_shared/native-push.ts`. FCM HTTP v1 and APNs token
  auth. Channel/sound constants renamed to `dismissal_alerts`/`dismissal_alert`. Dead tokens
  (`UNREGISTERED`, `410`, `BadDeviceToken`) are removed. Missing credentials are logged and
  skipped.
- **`supabase/functions/notify-parent/index.ts`** and **`supabase/functions/notify-staff/index.ts`**:
  call the native sender before the Web Push loop. The early returns for "no web subscriptions"
  were removed so native-only users still get pushes. Web Push code is otherwise unchanged.
- **`api/nursery.js`:** CORS for native origins (see section 2). Unchanged by this rework.

### Native project
- `native/`: one Capacitor project — `package.json`, `capacitor.config.json`, `android/`, `ios/`,
  `resources/`. App ID `com.technothera.dismissal`, name "Technothera Dismissal".
- Android uses `androidScheme: https`, which matches the API CORS origin.
- Icons and splash screens generated from placeholders (see section 5) via
  `npx @capacitor/assets generate --android --ios`.
- Placeholder release signing. The keystore is generated locally in `native/android/keystore/`
  and gitignored. Passwords are in `native/android/keystore.properties`, also gitignored.
- The two earlier per-role projects (`native/staff/`, `native/parent/`) were removed as part of
  this merge.

### CI
- `.github/workflows/ios-simulator-build.yml`: macOS runner, builds the one app for the iOS
  simulator with signing disabled (collapsed from a two-app build matrix). Pushes and signs
  nothing. Trigger it from the Actions tab if needed.

### Build commands
- `npm run build` for the web app (unchanged).
- `npm run build:native` for the store bundle (`dist-native/`).
- In `native/`: `npx cap sync`, `npx cap open android`, `npx cap open ios`.

---

## 4. Verified

| Check | Result |
|---|---|
| `npm run build:native` | Pass. Produces `dist-native/` with `com.technothera.dismissal` baked in. |
| `npm install` in `native/` | Pass |
| `npx cap add android` / `npx cap add ios` | Pass |
| `npx @capacitor/assets generate --android --ios` | Pass |
| `npx cap sync` | Pass |
| Android debug APK | Built: `native/android/app/build/outputs/apk/debug/app-debug.apk` |
| Merged manifest | Contains `POST_NOTIFICATIONS` and `INTERNET` |
| App display name | "Technothera Dismissal" in `strings.xml` and `Info.plist` (`CFBundleDisplayName`) |
| esbuild syntax check on edge functions and `native-push.ts` | Pass (after the channel/sound rename) |

## 5. Not verified

Be aware of these before relying on the work. These carry over unchanged from the earlier
two-app design — the merge to one app did not add or remove any of these gaps:

- **Nothing has run on a device or emulator.** Login, nursery code entry, branding, role-based
  routing after login, and push token registration have not been exercised at runtime.
- **Push delivery is untested end to end.** FCM and APNs send code has never been called against
  real credentials.
- **Migration not applied and not tested.** No Docker, so `supabase start` was not run. The RPC
  functions have not been exercised.
- **Edge functions not run.** Only syntax-checked.
- **iOS not compiled.** There is no Mac. The workflow is written but has not run in GitHub
  Actions.
- **Splash is still a placeholder.** It's a plain color background (no artwork) now that the old
  "Finnly" wordmark splash was removed. The real icon you provided is in place, but there's no
  dedicated splash artwork yet.
- **Sound.** `dismissal_alert.wav` is a generated tone, and iOS needs it added to the Xcode
  target (see section 1).
- **Android push.** No `google-services.json`, so the FCM path cannot run on Android yet.
- **Route scoping is UX only.** The admin, superadmin and display code is still bundled into the
  store build. It is not reachable through the UI. Tree-shaking would require further
  refactoring, which was not done.
- **Android release AAB.** Not re-verified after the merge (it was built with the placeholder
  keystore for the old staff/parent projects, not for Play either way). Run
  `./gradlew bundleRelease` in `native/android` yourself if you want to re-check this.

## 6. Known limitations and judgment calls

- **APNs sandbox vs production.** A token from an Xcode debug build is a sandbox token. Sending
  it to the production host returns `BadDeviceToken`, which deletes that row. This only affects
  developers. Set `APNS_USE_SANDBOX=true` when testing debug builds.
- **Token re-claim.** Logging in on a device moves its token to the new user. This is intentional
  and matches the Web Push behavior.
- **Sign-out release.** The token is released only from the main logout buttons. If the session
  has already expired, the release can fail, and the row stays until the token is re-claimed or
  the FCM/APNs send fails.
- **Native web bundle exposure.** Anyone who unpacks the store app can see the admin route code.
  Backend authorization still applies.
- **Sub-brand name.** There's a separate, not-yet-finalized decision about a consumer-facing name
  for this product line beyond "Technothera Dismissal" (e.g. for store listing copy). That can
  change later without touching the bundle ID or anything in this repo.

## 7. Store checklist

- **Apple Developer Program enrollment** ($99/yr), with the App ID and Push Notifications
  enabled.
- **Google Play Console account** ($25 one-time). Create the app. Upload a real upload key
  through Play App Signing. The placeholder keystore must not be used.
- **Store listing:** copy, screenshots, category, support URL, and the privacy policy URL.
- **Reviewer / demo credentials for the submission forms.** Use the existing "demo" tenant
  (`demo.technothera.com`, "Technothera Demo Nursery", 3 classes / 5 children already seeded) —
  never a real nursery's data:
  - Nursery code to enter on first launch: `demo`
  - Staff login: `staff@technothera.com` / `Demo12345` (tied to the "Rainbows" class, so a
    reviewer sees a real pickup flow)
  - Parent login: `omarhassan@technothera.com` / password not on file here — you'll need to
    supply or reset it before submission.
  - This is also a safe account for manually exercising the full pickup flow (staff marks ready,
    parent requests/arrives) without touching real nursery data.
- **Data safety / privacy labels.** Disclose these:
  - Device push tokens (linked to the account).
  - Children's names, dates of birth, and pickup/attendance records. These are sensitive data
    about minors, so check the requirements for children's data carefully.
  - Account email.
- **Privacy policy and terms.** Must cover the nursery-code flow and push tokens.
- **Age rating and children's policies.** The app is used by adults, but the content concerns
  children. Check the Google Play Families policy and Apple's guidelines for apps that handle
  children's data.

## 8. Credentials and where they go

| Name | Where | Source |
|---|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | Supabase Edge Function secrets | Firebase service account key (full JSON) |
| `APNS_AUTH_KEY` | Supabase Edge Function secrets | Apple `.p8` key contents |
| `APNS_KEY_ID` | Supabase Edge Function secrets | Apple key ID |
| `APNS_TEAM_ID` | Supabase Edge Function secrets | Apple team ID |
| `APNS_USE_SANDBOX` | Supabase Edge Function secrets, optional | `true` for debug builds only |
| `google-services.json` | `native/android/app/` | Firebase console |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` (local), or GitHub repository variables (CI) | Existing values |

Separately, to move this forward I'll need from you (asked for when actually needed, not before):
a **Supabase personal access token** (to apply the migration and deploy the two Edge Functions
for real), a **GitHub token** (to push the reconciliation branch in section 9), and/or a
**Vercel token** (to verify the `api/nursery.js` CORS change is actually live in production). I
won't create any Firebase, Apple Developer, or Google Play account on your behalf — you create
those yourself and hand me the resulting keys/credentials per the table above.

## 9. Repository notes — this clone has never been pushed anywhere

- This folder (`D:\Old D\MOBILE APPS\Dismissal Mobile`) is a clone of `D:\Old D\finnly-dismissal`
  at `2317b02`, with 4 commits on top (now 5+, including this rework). It has never been pushed —
  `git remote -v` here points at the local folder path, not GitHub.
- `D:\Old D\finnly-dismissal` itself has a real GitHub remote:
  `https://github.com/yusuf-abdelatti/dismissal-system.git`, `main` branch, also at `2317b02`, plus
  an `analytics-and-display-fix` branch I have not looked at or touched.
- Since both histories share `2317b02` as a common ancestor, this clone's commits can be pushed
  as a new branch to that same GitHub repo as a clean fast-forward from `main` — no rebase or
  history rewrite needed. **Not done yet** — needs an explicit go-ahead and a GitHub token (see
  section 8), and the branch name should be confirmed with you first.
- The brief file `You are working overnight, autonomo.txt` is untracked and was not committed.

## 10. Production deploy — needed once reconciled

The web-codebase changes in this work (`api/nursery.js` CORS, `apiUrl()`/native platform helpers
in `src/native/`, route scoping in `src/App.jsx`) only exist in this clone right now. For the
native app to work against the real backend, these changes need an actual deploy to
`technothera.com` (Vercel) — the same explicit-confirmation treatment as any other change to that
production app. I have not deployed anything, and won't without being told to.
