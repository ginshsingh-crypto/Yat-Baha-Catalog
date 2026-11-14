# Production photo storage

The API uses Google Cloud Storage through its standard Node.js client and Application Default Credentials (ADC). It can run on any host that can authenticate to that service. The static GitHub Pages preview stores its photos locally and does not use these settings.

## Server configuration

| Setting | Value |
| --- | --- |
| `PRIVATE_OBJECT_DIR` | A private bucket and app prefix, for example `/yat-biha-private/production` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional server-only path to an ADC configuration file when the host does not provide workload credentials |
| `GOOGLE_CLOUD_PROJECT` | Optional Google Cloud project ID used by ADC |

Prefer an attached service account or workload identity when the deployment host supports it. A mounted credential file is also supported by ADC. Never commit credential files or copy them into `EXPO_PUBLIC_` variables. Local user ADC alone may read storage but cannot necessarily sign upload URLs; use a signing-capable service account or supported impersonation configuration.

The service account needs access to create, read, and delete objects within the configured private bucket. Signing with IAM also requires `iam.serviceAccounts.signBlob` and the Service Account Credentials API. Grant permissions only to the intended storage and signing resources. [Google's signing setup](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers) describes the corresponding roles.

Use a private bucket with public access prevention. The app does not require anonymous bucket access. Only the API serves a sanitized image after checking that it belongs to a visible report. Configure retention and backup policies consistently with the app's deletion behavior; verify deletion in the intended production bucket.

## Browser uploads

An authenticated `POST /api/photos` returns a `photoId` and a V4 signed `PUT` URL valid for 15 minutes. The client uploads its bytes to that URL, then attaches `photoId` to a report. The report API validates ownership and the image, strips metadata, and stores the serving copy separately. Treat the upload URL as a temporary credential; do not log or publish it.

The bucket needs CORS for the actual production web origin if browser users upload photos. For a web app served at the existing GitHub Pages domain, an example configuration is:

```json
[
  {
    "origin": ["https://ginshsingh-crypto.github.io"],
    "method": ["PUT"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

Use the exact origin of each approved deployment; an origin has no URL path. Native uploads do not use browser CORS. CORS does not make a bucket public and does not replace the API's authorization checks. [Google's CORS configuration guide](https://docs.cloud.google.com/storage/docs/using-cors) explains how to apply and inspect it.

## Validation

Apply [`0001_account_deletion_guard.sql`](../lib/db/migrations/0001_account_deletion_guard.sql) to an existing database before deploying this API revision. A new database can use the complete Drizzle schema. The additive migration introduces the account deletion barrier and a timestamp recording the final raw-upload cleanup.

Each account mutation takes a database transaction advisory lock. Account deletion commits a barrier before removing reports, claims, messages, and photos, so an in-flight request cannot recreate public data after cleanup. The barrier retains only the identity provider's opaque user ID and the deletion-request timestamp after the identity is removed. This minimal record prevents an unexpired session from recreating data; disclose it in the final retention policy. Failed deletion remains retryable through the same account-deletion endpoint.

Photo attachment and orphan cleanup use the same photo-row lock. Cleanup rechecks that the photo is still unattached after acquiring that lock. Sanitization reads the exact object generation checked by metadata, stops at 6 MB, and rejects a truncated or oversized body. Raw uploads are purged after report commit and swept again after the signed-URL expiry window. A failed report transaction retains raw bytes for retry.

If a photo is deleted before its upload URL expires, an opaque raw-object path is retained in `photo_deletions` until 20 minutes after the upload was issued (the URL lasts 15 minutes). The hourly cleanup worker then removes any raw bytes recreated using that URL and deletes this temporary record. Storage failures keep the record for retry. The serving image is removed during deletion; neither the raw path nor this cleanup record is public. Production must run the worker or its scheduled cleanup command.

Run the adapter tests without live credentials:

```sh
pnpm --filter @workspace/api-server exec node --import tsx --test scripts/storage.test.ts scripts/photoBytes.test.ts scripts/reportDate.test.ts scripts/concurrency.test.ts
```

These verify private-path isolation, signed-upload options and expiry, generation-pinned bounded reads, and invalid object handling. The PostgreSQL concurrency suite requires an explicit `TEST_DATABASE_URL`; without it, only that suite is skipped. It creates and drops a random isolated schema and tests real advisory and row locks, deletion-versus-write races, attachment-versus-cleanup races, and retry after rollback. It does not fall back to the application's `DATABASE_URL`. All tests mock the storage service and do not establish that a real deployment has working IAM, bucket CORS, retention, or networking.

Before enabling shared reports, verify a real upload, attaching the photo, image sanitization, unauthenticated photo access only for visible reports, hiding, replacement, and deletion. Verify that raw uploads cannot be retrieved anonymously. Also run the two-account community integration tests against the intended development services.

Implementation references: [ADC for Cloud Storage](https://docs.cloud.google.com/storage/docs/authentication), [V4 upload example](https://docs.cloud.google.com/storage/docs/samples/storage-generate-upload-signed-url-v4), and [signed URL behavior](https://docs.cloud.google.com/storage/docs/access-control/signed-urls).
