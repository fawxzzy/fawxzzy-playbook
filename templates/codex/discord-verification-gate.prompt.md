# Discord Verification Gate Prompt

## Objective

Implement a Discord verification gate where the source app is the identity authority and Discord grants access only after the app issues short-lived proof.

## Architecture

Source app authenticated session
-> one-time verification token
-> Discord modal submit
-> signed HTTP interactions endpoint
-> token consumed once
-> Discord role grant through REST API

Keep the source app as identity authority. Discord should consume proof, not become the source of truth.

Example note: a fitness app, education portal, or paid membership app can use this pattern without changing the core flow.

## Files to inspect

- auth/session middleware and server-route exemptions
- existing settings/account UI surfaces
- API routes for source-app authenticated actions
- Discord integration modules or bot utilities
- database schema and migration locations
- deployment/env configuration files
- existing tests for auth, API routes, and Discord integrations

## Source app backend task

- Add an authenticated endpoint that generates a short-lived one-time Discord verification token.
- Store only a hash of the token plus expiry/consumption metadata.
- Protect generation behind a real authenticated app session.
- Add a one-time consume path that fails on missing, expired, or reused tokens.
- If a legacy bot-to-app verification bridge exists, keep any shared-secret validation isolated from the signed interactions path.
- Return only the display token and expiry details needed for the current UI session.

## Database migration task

- Add a verification-token table or equivalent storage surface.
- Store token hash only, never raw token.
- Include expiry and consumed-at state.
- Add indexes and uniqueness guarantees needed for deterministic single-use consumption.
- If helpful, add a database function or transaction-safe consume helper so token use is atomic.

## Token UI task

- Add an account/settings verification section in the source app.
- Show a generate token action.
- Render the token in a readonly field with a copy button.
- Show expiry text clearly.
- Do not persist the token in localStorage, profile state, URL params, or long-lived account records.

## Discord interactions endpoint task

- Add a signed HTTP endpoint for Discord interactions.
- Read the raw request body.
- Verify the Ed25519 signature before JSON parsing or payload execution.
- Respond to Discord PING with `{ "type": 1 }`.
- Handle a verify button flow that opens a modal.
- On modal submit, consume the one-time token and grant the configured Discord role through the Discord REST API.
- Fail closed on malformed or unsigned requests.
- Do not claim verification success if the Discord role grant fails.

## Env vars

Use repo-appropriate names. Typical variables include:

- `DISCORD_PUBLIC_KEY`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_VERIFIED_ROLE_ID`
- `DISCORD_VERIFY_CHANNEL_ID`
- `DISCORD_UNVERIFIED_ROLE_ID` (optional)
- `DISCORD_BOT_TOKEN`
- source-app token pepper variable
- source-app Discord verification shared secret variable if a legacy bridge still exists
- admin/service database key only where required

Do not hard-code secret values. Do not commit copied secrets.

## Manual Discord portal steps

- Create the Discord application.
- Add the bot to the target server.
- Create the verification channel and target roles.
- Put the bot role above the role it must grant.
- Give the bot `Manage Roles`.
- Set the Interactions Endpoint URL to `https://<app-domain>/api/discord/interactions`.
- Register `/setup-verify` only if the app still needs a setup command for message/button seeding.

## Tests

- Token generation requires an authenticated app session.
- Raw tokens are never stored.
- Expired tokens are rejected.
- Reused tokens are rejected.
- Unsigned or malformed interaction requests return `401`.
- PING returns the correct Discord handshake response.
- Modal submit consumes the token once and attempts the Discord REST role grant.
- Role-grant failure does not return a false success state.
- Auth middleware exemptions allow the Discord endpoint to stay reachable without user-session redirects.

## Deployment checklist

- Production env vars are set.
- The app is redeployed after env changes.
- Discord accepts the signed Interactions Endpoint URL.
- Any old local-only Gateway bot path is disabled for production use.
- The end-to-end token flow is tested in a real Discord server.

## Acceptance criteria

- The source app remains the identity authority.
- Discord access is granted only after one-time token consumption.
- The interactions endpoint verifies signatures before parsing.
- The verification flow works without a local always-running Gateway bot.
- Reused or expired tokens fail.
- No secret values are committed.

## Security guardrails

- Rule: The source app owns identity; Discord consumes proof.
- Rule: Email knowledge is not identity proof.
- Rule: Discord interaction requests must be signature-verified before parsing.
- Rule: One-time verification tokens are ephemeral proof, not account data.
- Rule: Production Gateway bots require persistent worker hosting.
- Pattern: Authenticated app session -> one-time token -> Discord modal -> signed endpoint -> token consume -> role grant.
- Pattern: Prototype with Gateway when speed matters; promote to HTTP interactions when availability and app ownership matter.
- Failure Mode: Local-only bots make Discord verification unavailable when the process dies.
- Failure Mode: Auth middleware redirects make Discord endpoint verification fail before app logic runs.
- Failure Mode: Unsigned request handling turns role grant into a public attack surface.
