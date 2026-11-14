# Mobile release preparation

The repository contains the mobile app and its API. GitHub Pages hosts the browser preview. Shared user accounts and reports require a running API and storage service.

## Runtime configuration

| Setting | Purpose |
| --- | --- |
| `EXPO_PUBLIC_PREVIEW_MODE=true` | Local preview with sample data and isolated device storage |
| `EXPO_PUBLIC_PREVIEW_MODE=false` | Shared community app |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public client key for the production Clerk application |
| `EXPO_PUBLIC_DOMAIN` | HTTPS API host, without the protocol |
| `EXPO_PUBLIC_CLERK_PROXY_URL` | Optional authentication proxy URL |
| `DATABASE_URL` | Server-only PostgreSQL connection |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Server authentication configuration |

`EXPO_PUBLIC_` values are bundled into the app. Only public client configuration belongs in those variables. API storage and cleanup requirements are documented in `artifacts/api-server/COMMUNITY.md`.

## Store release inputs

- Final Android application ID and iOS bundle ID supplied by the release owner.
- Google Play Console and Apple Developer accounts with signing access.
- Production API, database, authentication, and private photo storage.
- A named moderator and tested moderation operations.
- Public support contact, privacy policy, and accurate store data disclosures.
- Store screenshots captured from the release build and Arabic listing copy.

## Device acceptance

Test the release build on Android and iPhone. Check account creation and sign-in, report creation and editing, camera and photo access, Arabic layout, searching and saving, private claims, moderator approval, ownership permissions, deletion and retries, and network recovery. Use separate accounts to verify that one person cannot read another person's private claims or alter another person's reports.

The current browser preview validates the local app flow. Store submission remains pending until production services and signing are configured and the native release builds pass device testing.

## Build profiles and service setup

`artifacts/yat-biha/eas.json` contains an internal `review` profile (device-local data, Android APK) and a `production` profile (shared service). Set `ANDROID_APPLICATION_ID` and `IOS_BUNDLE_IDENTIFIER` to the final identifiers in your EAS environment, link the app to the owner's Expo project, and configure signing before building. No store account or signed binary has been created by these source changes.

For the shared service, use the server/client `.env.example` files as a configuration inventory. The web client now uses the same configured HTTPS API and bearer authentication as the native client; the server can run independently of the preview host. Configure the API's allowed Clerk origins, database, private bucket, and moderator before accepting real users. Follow [storage setup](storage.md), [photo assistance](vision.md), and [community operations](../artifacts/api-server/COMMUNITY.md). Apply the checked-in database migrations before deploying an updated API.

The optional image assistance route makes a real model request only after explicit consent. It proposes a category and visible color; the person reviews the result. The static preview does not simulate a model call. Set a spending budget, evaluate real object photos and refusal behavior, and provide the final service privacy notice before enabling it publicly.

## Quality checks

`pnpm test:app` covers Arabic/English search, matching contradictions, date/privacy validation, drafts, private recovery notes, and storage failures. `pnpm preview:pages` exports the actual app. The preview workflow checks types, tests behavior, verifies the offline export, and publishes on main. API checks validate model failures and storage behavior with mocked external services, then exercise mutation races in an isolated PostgreSQL database.

Matching is an explainable heuristic, not a calibrated probability or proof of ownership. Public release quality still requires a labeled Arabic/English lost-and-found evaluation set and real recovery outcomes. Native JavaScript exports are compilation checks; they do not replace testing signed binaries on Android/iOS with VoiceOver/TalkBack, enlarged text, camera permissions, weak connectivity and separate accounts.
