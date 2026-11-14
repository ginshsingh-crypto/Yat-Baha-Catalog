# Optional photo assistance

This is a real, optional server integration. It is not enabled in the GitHub Pages preview, does not simulate recognition, and does not perform image-to-image matching or ownership verification. The app's text matching remains a separate deterministic heuristic.

When enabled in a production build, a signed-in user can explicitly send one selected image for a category and color suggestion. The suggestion is shown for review and is applied only when the user chooses it. The rest of the report remains editable. Manual reporting always works without this service.

## Configuration

Set these on the API server, never in public Expo variables or Git:

- `OPENAI_API_KEY`: a project-scoped OpenAI key.
- `OPENAI_VISION_MODEL`: a model available to that project that supports image inputs and strict JSON Schema output through the Responses API. There is deliberately no default model or automatic account provisioning.

The mobile production build already needs `EXPO_PUBLIC_DOMAIN` (API hostname), Clerk configuration, and `EXPO_PUBLIC_PREVIEW_MODE=false`. Requests use the current user's Clerk bearer token. No model API key enters the frontend bundle. The endpoint returns 503 when the server configuration is missing.

## Boundary and data handling

`POST /api/assist/photo` takes exactly `{ "image": "data:image/...;base64,...", "consent": true }`.

- Authentication and rate limits run before the larger JSON parser.
- Maximum decoded image size: 2 MB. Maximum input pixels: 16 million. Supported formats: JPEG, PNG, and WebP, decoded and verified with Sharp. No remote image URL is accepted.
- The server resizes to at most 1024 × 1024, strips metadata, and re-encodes to JPEG before sending the image to the fixed `https://api.openai.com/v1/responses` endpoint. It does not store the image in this route.
- Metadata removal does **not** redact text or people visible in pixels. The consent UI tells the user to avoid people, IDs, bank cards, and private information. A model privacy flag is an additional fallible check, not a guarantee that sensitive pixels were absent before transmission.
- Model output is restricted to category/color enums and two booleans. The backend constructs the Arabic title/description from allow-listed strings; it never returns arbitrary model text, OCR, names, numbers, addresses, or inferred ownership. Documents, uncertain objects, and flagged private content do not receive suggestions.
- Provider failures, invalid output, refusal, timeouts, and missing configuration produce explicit recoverable errors. No fake fallback suggestion is returned.
- Requests set `store: false`. This is not a zero-retention promise: provider abuse-monitoring retention and the account's applicable data controls still apply. The production privacy policy and app-store disclosures must accurately name this processing before enabling it.
- Current limits are 6 attempts per user per hour and 120 attempts per server process per hour. Limits use memory and reset on process restart. For multiple API replicas or a public launch, use a shared rate-limit store and a provider project spending limit. Keep the feature disabled until the responsible operator approves this configuration and cost policy.
- This integration does not log image bodies or provider error bodies. Existing request logging records method/path/status only.

## Validation

Run `pnpm --filter @workspace/api-server run test:photo-assist`.

The isolated test uses a mocked model response and injected test authentication. It checks malformed/oversized/remote image rejection, format validation and EXIF removal, enum-only output, unavailable/refusing/malformed provider responses, explicit consent, authentication before body parsing, per-user rate limits, and the fixed provider request with `store: false`. It makes no paid provider calls and creates no external accounts. API TypeScript checks also pass.

Before enabling production, additionally test real Clerk sessions, provider-model compatibility, representative Arabic reports and item photos, false category/color suggestions, refusal behavior, costs, and native Android/iOS consent flows. No real-provider evaluation or production deployment has been completed by these isolated tests.

## Provider documentation

- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Data controls](https://developers.openai.com/api/docs/guides/your-data)
