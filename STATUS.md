# Finnly native apps: status

Two Capacitor store apps built from this repo: **Finnly Staff** and **Finnly Parent**. Admin, superadmin and display are unchanged and are still web-only.

Work was done in a clone of `D:\Old D\finnly-dismissal` (HEAD `2317b02`). The original folder was only read from, never written to.

---

## 1. What to do next (in order)

Nothing below has been done on your behalf. Each item needs your accounts or your decision.

1. **Firebase (Android push).** Create a Firebase project. Add two Android apps: `com.technothera.finnlystaff` and `com.technothera.finnlyparent`. Download each `google-services.json` and place it at `native/staff/android/app/google-services.json` and `native/parent/android/app/google-services.json`. These files are configuration for your Firebase project, so keep them out of git (the `.gitignore` already excludes them). Without these files, Android builds succeed but push does not work.
2. **Firebase service account.** In Project settings → Service accounts, generate a new private key. Set the whole JSON as the Supabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`. Use one project for both apps, since FCM is project-scoped.
3. **Apple APNs key.** In the Apple Developer account, create a key with the Apple Push Notifications service (APNs) capability. Download the `.p8` file once; Apple does not show it again. Set these Supabase secrets:
   - `APNS_AUTH_KEY`: the full contents of the `.p8` file.
   - `APNS_KEY_ID`: the 10-character Key ID.
   - `APNS_TEAM_ID`: your 10-character Team ID.
   - `APNS_USE_SANDBOX`: `true` only if you test with Xcode debug builds. Leave it unset for TestFlight and App Store builds.
4. **Apple app IDs.** Register the bundle IDs `com.technothera.finnlystaff` and `com.technothera.finnlyparent` in the Apple Developer portal. Enable the Push Notifications capability on both.
5. **Xcode, on a Mac (or via the CI workflow).**
   - Add `native/*/ios/App/App/sounds/finnly_alert.wav` to the App target's resources. It is copied to disk but not yet referenced in the Xcode project.
   - In Signing & Capabilities, add Push Notifications and select your team.
6. **Apply the migration and deploy the functions.** Review `supabase/migrations/20261006000000_device_push_tokens.sql`, then run `supabase db push` and `supabase functions deploy notify-parent notify-staff` yourself. Nothing here applies them.
7. **Real app icon.** The icon currently comes from `public/icon.png`, which is only 192×192. The store needs a 1024×1024 master, opaque, no transparency. Replace `native/*/resources/icon.png`, then run `npx @capacitor/assets generate` in each native folder.
8. **Store accounts** (see section 7).

---

## 2. Decisions and why

| Topic | Decision | Reason |
|---|---|---|
| Nursery code | Typed slug, entered once on first launch | Admin has no QR code anywhere (`qrcode` is a dev dependency, `qr-installing.png` is unreferenced). A typed code needs no second device. The code is the existing tenant slug, so `/api/nursery?slug=` is reused unchanged. |
| Code storage | Capacitor Preferences (`finnly_nursery_slug`) | Survives restarts, so branding and the login screen load before sign-in. |
| API base | `https://technothera.com` in native builds only (`VITE_API_BASE_URL`) | Capacitor's WebView origin is not the website, so relative `/api` calls would fail. Web builds keep relative paths. |
| CORS | `/api/nursery` allows `capacitor://localhost`, `https://localhost`, `http://localhost`, and sends `Vary: Origin` | Only the nursery lookup is called cross-origin by the store apps. Other `/api` routes are web-only and unchanged. |
| Route scoping | Build-time `VITE_APP_ROLE`. Each build mounts only its own role's route. Other paths redirect to `/`. A wrong-role account sees a "This app is for X accounts" screen with sign-out. | No redirect loops. The backend still enforces real access (RLS), so this is UX scoping, not security. |
| Per-app config | `scripts/build-native.mjs` sets role, app ID and API base in code | `.env*` is gitignored, and these values have to be committed. |
| Push token table | `device_push_tokens`, one row per app per device. Writes go through `claim_device_push_token` and `release_device_push_token` (security definer). | A device handed to another account is re-claimed, the same rule Web Push uses. RLS on the table alone cannot allow that. |
| Store `app_id` per token | Stored with each token | APNs needs the bundle ID as the topic. Staff and parent have different IDs. |
| Web Push | Unchanged. Native sends run first and never throw. | The brief says Web Push must keep working. A missing native credential logs and skips. |
| Android channel | `finnly_alerts`, importance MAX, sound `finnly_alert`, vibration | This is the heads-up, audible notification the brief asks for. Channel settings are locked by Android after creation, so they are set on the client. |
| Sound file | Generated two-tone WAV (`finnly_alert.wav`) | Placeholder. Replace with a brand sound if wanted. |
| Service worker | Not registered in native builds. PWA install banner hidden. | Service workers do not belong inside a WebView. |

---

## 3. What was built

### Client (`src/`)
- `src/native/platform.js`: `isNative`, `APP_ROLE`, `apiUrl()`.
- `src/native/nurseryStorage.js`: stored nursery code.
- `src/native/push.js`: permission prompt, Android channel, token registration and claim, release on sign-out.
- `src/components/NurseryCodeScreen.jsx`: first-launch code entry.
- `src/hooks/useTenant.jsx`: on native, reads the stored code. Shows the code screen when none is stored. Exposes `submitNurseryCode`.
- `src/App.jsx`: route-scoped tree for native builds, `NativePushRegistrar`, wrong-app screen, PWA banner hidden on native.
- `src/main.jsx`: service worker skipped on native.
- `src/interfaces/staff/StaffApp.jsx`, `src/interfaces/parent/ParentApp.jsx`: release push token before sign-out.
- `src/interfaces/feedback/FeedbackForm.jsx`, `src/interfaces/superadmin/NurseryAnalyticsDetail.jsx`, `src/interfaces/superadmin/OrganizationDetail.jsx`: `/api` calls go through `apiUrl()`. Behavior on web is unchanged.

### Backend
- **Migration:** `supabase/migrations/20261006000000_device_push_tokens.sql`. Additive only. Creates `device_push_tokens`, RLS (read and delete own rows), and two security-definer functions. Not applied.
- **Shared sender:** `supabase/functions/_shared/native-push.ts`. FCM HTTP v1 and APNs token auth. Dead tokens (`UNREGISTERED`, `410`, `BadDeviceToken`) are removed. Missing credentials are logged and skipped.
- **`supabase/functions/notify-parent/index.ts`** and **`supabase/functions/notify-staff/index.ts`**: call the native sender before the Web Push loop. The early returns for "no web subscriptions" were removed so native-only users still get pushes. Web Push code is otherwise unchanged.
- **`api/nursery.js`:** CORS for native origins (see section 2).

### Native projects
- `native/staff/` and `native/parent/`: each is a separate Capacitor project with its own `package.json`, `capacitor.config.json`, `android/`, `ios/`, and `resources/`.
  - Staff: app ID `com.technothera.finnlystaff`, name "Finnly Staff".
  - Parent: app ID `com.technothera.finnlyparent`, name "Finnly Parent".
- Android uses `androidScheme: https`, which matches the API CORS origin.
- Generated icons and splash screens for both apps (from placeholders, see section 5).
- Placeholder release signing. Keystores are generated locally in `native/*/android/keystore/` and gitignored. Passwords are in `native/*/android/keystore.properties`, also gitignored.

### CI
- `.github/workflows/ios-simulator-build.yml`: macOS runner, builds both apps for the iOS simulator with signing disabled. Pushes and signs nothing. Trigger it from the Actions tab if needed.

### Build commands
- `npm run build` for the web app (unchanged).
- `npm run build:native:staff` and `npm run build:native:parent` for the store bundles (`dist-staff/`, `dist-parent/`).
- In `native/staff` or `native/parent`: `npx cap sync`, `npx cap open android`, `npx cap open ios`.

---

## 4. Verified

| Check | Result |
|---|---|
| `npm ci` | Pass |
| `npm run build` (web) | Pass |
| `node scripts/build-native.mjs staff` and `parent` | Pass. Staff bundle contains `com.technothera.finnlystaff` and `"staff"`. |
| `npx cap sync` for both apps | Pass |
| Android debug APK, staff | Built: `native/staff/android/app/build/outputs/apk/debug/app-debug.apk` |
| Android debug APK, parent | Built: `native/parent/android/app/build/outputs/apk/debug/app-debug.apk` |
| Merged manifest | Contains `POST_NOTIFICATIONS` and `INTERNET` in both apps |
| Android release AAB, staff and parent | Built with the placeholder keystore. Not for Play. |
| esbuild syntax check on edge functions and `native-push.ts` | Pass |

## 5. Not verified

Be aware of these before relying on the work:

- **Nothing has run on a device or emulator.** I did not test login, nursery code entry, branding, route scoping, or push token registration at runtime.
- **Push delivery is untested end to end.** FCM and APNs send code has never been called against real credentials. The Deno `fetch` HTTP/2 behavior for APNs is assumed, not confirmed.
- **Migration not applied and not tested.** No Docker, so `supabase start` was not run. The RPC functions have not been exercised.
- **Edge functions not run.** Only syntax-checked.
- **iOS not compiled.** There is no Mac. The workflow is written but has not run in GitHub Actions.
- **Icons and splash are placeholders.** The icon is `public/icon.png` upscaled from 192px. The splash is the logo centered on `#EAE5DF`.
- **Sound.** `finnly_alert.wav` is a generated tone, and iOS needs it added to the Xcode target (see section 1).
- **Android push.** No `google-services.json`, so the FCM path cannot run on Android yet.
- **Route scoping is UX only.** The admin, superadmin and display code is still bundled into the store builds. It is not reachable through the UI. Tree-shaking would require further refactoring, which I did not do.

## 6. Known limitations and judgment calls

- **APNs sandbox vs production.** A token from an Xcode debug build is a sandbox token. Sending it to the production host returns `BadDeviceToken`, which deletes that row. This only affects developers. Set `APNS_USE_SANDBOX=true` when testing debug builds.
- **Token re-claim.** Logging in on a device moves its token to the new user. This is intentional and matches the Web Push behavior.
- **Sign-out release.** The token is released only from the main logout buttons. If the session has already expired, the release can fail, and the row stays until the token is re-claimed or the FCM/APNs send fails.
- **Native web bundle exposure.** Anyone who unpacks the store app can see the admin route code. Backend authorization still applies.

## 7. Store checklist

- **Apple Developer Program enrollment** ($99/yr), with two App IDs and Push Notifications enabled.
- **Google Play Console account** ($25 one-time). Create two apps. Upload a real upload key through Play App Signing. The placeholder keystore must not be used.
- **Store listings for both apps:** copy, screenshots, category, support URL, and the privacy policy URL.
- **Data safety / privacy labels.** Disclose these:
  - Device push tokens (linked to the account).
  - Children's names, dates of birth, and pickup/attendance records. These are sensitive data about minors, so check the requirements for children's data carefully.
  - Account email.
- **Privacy policy and terms.** Both must cover the nursery-code flow and push tokens.
- **Age rating and children's policies.** Both apps are used by adults, but the content concerns children. Check the Google Play Families policy and Apple's guidelines for apps that handle children's data.

## 8. Credentials and where they go

| Name | Where | Source |
|---|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | Supabase Edge Function secrets | Firebase service account key (full JSON) |
| `APNS_AUTH_KEY` | Supabase Edge Function secrets | Apple `.p8` key contents |
| `APNS_KEY_ID` | Supabase Edge Function secrets | Apple key ID |
| `APNS_TEAM_ID` | Supabase Edge Function secrets | Apple team ID |
| `APNS_USE_SANDBOX` | Supabase Edge Function secrets, optional | `true` for debug builds only |
| `google-services.json` (per app) | `native/<role>/android/app/` | Firebase console, one per Android app |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` (local), or GitHub repository variables (CI) | Existing values |

## 9. Repository notes

- The clone's HEAD is `2317b02`. The source repo has uncommitted changes (`dist/index.html`, `supabase/.temp/cli-latest`). They are not in the clone, so they are not part of this work.
- The brief file `You are working overnight, autonomo.txt` is untracked and was not committed.
- No `git push` and no remote were configured or used.
