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
