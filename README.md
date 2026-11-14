# يأت بها

تطبيق عربي للمفقودات والمعثورات. من الحاجة إلى الوصول.

[افتح معاينة التطبيق](https://ginshsingh-crypto.github.io/Yat-Baha-Catalog/)

Open the preview link on your phone or computer. Explore the sample reports, add a lost or found item, attach a photo, search by city and category, save reports, edit your entries, and mark an item returned. Entries in this preview stay in that browser or device. The screen identifies the preview and the sample reports.

The same Expo app source supports Android, iOS, and the browser. The browser preview runs from GitHub Pages and updates when changes reach `main`. All source code, supplied brand files, and deployment configuration are in this repository.

## Preview on a phone with Expo Go

Use Node.js 24 and pnpm 11.25.0. From the repository root run

```sh
pnpm --filter '@workspace/yat-biha...' install --frozen-lockfile --ignore-scripts
pnpm preview
```

Open Expo Go for SDK 58 on an Android device on the same Wi-Fi and scan the terminal QR code. The preview starts with sample reports and requires no account or service credentials. The browser link above is the simplest review option on iPhone and Android.

## GitHub Pages deployment

The `App preview` workflow checks TypeScript, exports the app, and deploys it. The repository Pages source must be **GitHub Actions**. Pull requests build the preview without deploying. GitHub Pages uses `404.html` to load dynamic report routes after refresh, and `.nojekyll` permits Expo's generated asset paths.

For a local production export run

```sh
pnpm preview:build
```

For the repository subpath used by GitHub Pages run

```sh
pnpm preview:pages
```

Both write `artifacts/yat-biha/dist`. Generated output is rebuilt by GitHub Actions.

## Source

| Location | Contents |
| --- | --- |
| `artifacts/yat-biha` | Expo app for Android, iOS, and web |
| `artifacts/api-server` | Shared reports, claims, moderation, and photo API |
| `lib/db` | PostgreSQL schema |
| `lib/api-spec` | OpenAPI contract |
| `docs/brand` | Supplied partnership brief and original logos |
| `.github/workflows/preview.yml` | Preview checks and deployment |

## Before the public mobile release

The browser preview exercises local reports. The shared service still needs its production database, authentication, private photo storage, API domain, and a designated moderator. Production builds must set `EXPO_PUBLIC_PREVIEW_MODE=false` and supply the real Clerk publishable key and API domain. Keep service secrets in deployment settings and out of Git.

The release owner must provide the final Android application ID, iOS bundle ID, store developer accounts and signing access, support contact, and the final privacy policy and store disclosures. Then build and test the signed Android and iOS apps, including login, cross-user claims, moderation, photo deletion, and account deletion, before submitting to the stores. See [release preparation](docs/release.md).

The partnership brief describes further community services and proposed collaborations. The first app focuses on lost-and-found. The brand materials attribute the concept, preparation, and design to **أ. د. فهد بن حمد المغلوث**.
