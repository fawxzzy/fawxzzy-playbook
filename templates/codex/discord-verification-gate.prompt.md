# Discord Verification Gate Prompt

## Objective

Implement a Discord verification gate where the source app is the identity authority and Discord grants access only after the app issues short-lived proof.

## Architecture

Source app authenticated session
-> one-time verification token
-> Discord modal submit
-> signed HTTP interactions endpoint
-> token consumed once
-> durable Discord/source-app link
-> Discord role grant through REST API
-> optional nickname sync from source-app display state

Keep the source app as identity authority. Discord should consume proof, not become the source of truth.

Example note: a fitness app, education portal, or paid membership app can use this pattern without changing the core flow.

## Files to inspect

- auth/session middleware and server-route exemptions
- existing settings/account UI surfaces
- API routes for source-app authenticated actions
- Discord integration modules or bot utilities
- database schema and migration locations
- any existing Discord/source-app link tables or sync scripts
- release ledger or release-note sources if public announcements are in scope
- deployment/env configuration files
- existing tests for auth, API routes, and Discord integrations

## Source app backend task

- Add an authenticated endpoint that generates a short-lived one-time Discord verification token.
- Store only a hash of the token plus expiry/consumption metadata.
- Protect generation behind a real authenticated app session.
- Add a one-time consume path that fails on missing, expired, or reused tokens.
- If a legacy bot-to-app verification bridge exists, keep any shared-secret validation isolated from the signed interactions path.
- Return only the display token and expiry details needed for the current UI session.
- If Discord display state should persist, add a durable Discord/source-app link record that stores only the governed identifiers and display snapshot needed for sync.

## Database migration task

- Add a verification-token table or equivalent storage surface.
- Store token hash only, never raw token.
- Include expiry and consumed-at state.
- Add indexes and uniqueness guarantees needed for deterministic single-use consumption.
- If helpful, add a database function or transaction-safe consume helper so token use is atomic.
- If the product exposes a member display number in Discord, add a durable Discord/source-app link table with sync-state fields.
- If member display numbers can compact or drift, add an audit path and a deterministic resync path.

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
- If the product exposes app-owned member display numbers, persist the link and attempt nickname sync as a side effect.
- Fail closed on malformed or unsigned requests.
- Do not claim verification success if the Discord role grant fails.
- Do not fail durable verification persistence just because nickname sync is blocked by Discord role hierarchy or owner restrictions.

## Member-number display extension task

Use this only if Discord should display a source-app member number or other app-owned display identity.

- Treat the source app profile number as the source of truth.
- Persist a Discord/source-app link row with the app user id, Discord user id, display-number snapshot, and sync state.
- Decide explicitly whether the number is a compact public slot or a stable historical identity number.
- If the product uses compaction, document that the number is display state, not permanent identity history.
- Exclude automation, Codex, and QA accounts from public-number allocation if the product requires human-only numbering.
- Add audit and resync scripts if deletes or compaction can leave Discord nicknames stale.

Known Discord limitation:

- Server owners and users with equal or higher roles than the bot can verify successfully but still reject nickname updates with `403`.
- Verification persistence must not depend on nickname update success.

## Support and bug-report extension task

If the repo is also designing a Discord support or bug-report flow:

- Use a Discord modal or structured form, not free-form repo writes.
- Store reports in a governed database queue, not direct commits into ATLAS or Git history.
- Add rate limits and duplicate fingerprints.
- Route reports through Playbook or another triage layer before promotion into issues, tasks, or doctrine.
- Do not allow automatic code changes or automatic repo commits from Discord-originated user input.

Desired pattern:

- Discord modal -> structured queue -> governed triage -> reviewed issue or task

## Curated release announcement extension task

If the repo is also designing a Discord release bot:

- Publish only admin-approved user-facing copy.
- Never dump raw changelog, infra, or migration noise directly into Discord.
- It is acceptable to draw from a release ledger or PR set, but public copy still requires curation.
- Keep the audience broad and non-technical unless a specialized channel explicitly expects engineering detail.

Desired pattern:

- Internal release truth -> curated public announcement

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
- Durable link persistence survives nickname-sync failure when Discord blocks rename operations.
- If member numbers compact, audit and resync paths prove Discord display repair is possible.
- Auth middleware exemptions allow the Discord endpoint to stay reachable without user-session redirects.

## Deployment checklist

- Production env vars are set.
- The app is redeployed after env changes.
- Discord accepts the signed Interactions Endpoint URL.
- Any old local-only Gateway bot path is disabled for production use.
- The end-to-end token flow is tested in a real Discord server.

## Acceptance criteria

- The source app remains the identity authority.
- Discord remains display and transport, not parallel identity truth.
- Discord access is granted only after one-time token consumption.
- The interactions endpoint verifies signatures before parsing.
- The verification flow works without a local always-running Gateway bot.
- If member numbers are in scope, the repo documents whether they are compact public display slots or stable historical identity numbers.
- If support or bug reports are in scope, they enter a review queue before becoming repo truth.
- If release posts are in scope, they are curated user communication rather than raw internal logs.
- Reused or expired tokens fail.
- No secret values are committed.

## Security guardrails

- Rule: The source app owns identity; Discord consumes proof.
- Rule: Discord should display source-app truth, not create parallel truth.
- Rule: Email knowledge is not identity proof.
- Rule: Discord interaction requests must be signature-verified before parsing.
- Rule: One-time verification tokens are ephemeral proof, not account data.
- Rule: Production Gateway bots require persistent worker hosting.
- Rule: User reports enter review queues before becoming repo truth.
- Rule: Release bots post curated user communication, not internal deployment logs.
- Pattern: Authenticated app session -> one-time token -> Discord modal -> signed endpoint -> token consume -> role grant.
- Pattern: Source-app profile number -> Discord link table -> nickname sync.
- Pattern: Prototype with Gateway when speed matters; promote to HTTP interactions when availability and app ownership matter.
- Pattern: Discord modal -> structured queue -> governed triage -> reviewed task.
- Pattern: Internal release truth -> curated public announcement.
- Failure Mode: Local-only bots make Discord verification unavailable when the process dies.
- Failure Mode: Discord-side state drifts from source-app state.
- Failure Mode: Auth middleware redirects make Discord endpoint verification fail before app logic runs.
- Failure Mode: Owner or high-role users verify correctly but cannot be renamed by the bot.
- Failure Mode: Unsigned request handling turns role grant into a public attack surface.
- Failure Mode: Direct Discord-to-repo writes create noisy or abusive history.
- Failure Mode: Raw technical release posts are hostile to normal users.
