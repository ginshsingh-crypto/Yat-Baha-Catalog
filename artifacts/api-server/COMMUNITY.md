# Community operations

## Moderators

There is no first-user administrator and no automatic role based on an unverified email.
After a trusted moderator signs up and verifies their email, an operator can grant access:

```sh
pnpm --filter @workspace/api-server moderator grant <verified-account-email>
pnpm --filter @workspace/api-server moderator revoke <verified-account-email>
```

The command targets the current environment's Clerk instance and database. Development
accounts and moderator grants do not transfer to production. Run it with the intended
environment's configuration; never copy production credentials into development.
The user has not yet designated a real moderator. Until one is granted, contact messages
remain pending and are not delivered. No review time is promised.

Moderators open More → Review content. Reject messages containing contact details,
links, identity documents, threats or payment requests. Approving a message only permits
delivery; it does not verify identity or ownership. An upheld abuse report hides the
report and disables further claims/contact. Owners may still delete hidden reports.

## Photos and deletion

Upload URLs accept bytes directly into private App Storage. The API verifies the uploader,
size and image format before decoding/re-encoding to an immutable JPEG with metadata removed.
Only attached photos of visible reports can be served. Raw uploads are never served.
The storage service must not be configured to make the private bucket publicly readable.

Deleting reports cascades claims/messages/abuse rows and deletes the attached photo.
Deleting accounts hides reports first, removes all owned photos and community data, then
deletes the Clerk identity. Failures are explicit and retryable.
An account-deletion barrier is committed before cleanup. All account writes acquire the
same database advisory lock and reject this barrier, so an overlapping request cannot
recreate data after deletion. The barrier retains only the identity provider's opaque
user ID and deletion-request timestamp to reject unexpired sessions. Apply
`lib/db/migrations/0001_account_deletion_guard.sql` before this API revision; include
this minimal retention in the final privacy policy.
If a signed upload URL is still valid when its photo is deleted, a temporary opaque
raw-object path remains in `photo_deletions`. After the URL expires, cleanup removes
any recreated raw bytes and this marker. Storage failures retain it for retry.
Old replaced photos and abandoned uploads are private. The API runs cleanup on startup
and hourly while running, with retry logging and no overlapping runs. The following command also deletes
unattached uploads older than one day (including uploads recreated using an unexpired PUT URL):

```sh
pnpm --filter @workspace/api-server cleanup-photos
```

Public report text receives basic contact-data validation; it is not comprehensive automated
content moderation. Review abuse reports regularly. Images are format-sanitized, not
visually screened. Do not imply official partnerships or verified ownership.

## Local data

Old device-only reports are not silently uploaded or assigned to whichever account signs in.
They remain marked local, with an explicit “publish a copy” action. Device bookmarks and
legacy reports are device-wide; shared reports and private request caches are account-scoped.
Demo reports are marked and are matched only against demos.

## Verification

Run `pnpm run typecheck`. The HTTP integration test exercises two isolated Clerk sessions,
cross-user denial, private evidence, moderation and photo sanitization/deletion:
`pnpm --filter @workspace/api-server test:community`.
This uses only temporary development identities/data and never prints session credentials.
