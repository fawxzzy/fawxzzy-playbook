# Discord Verification Gates

## Purpose

A reusable pattern for Discord access gates where another app is the identity authority and Discord only displays or grants side effects from source-app truth.

## Production architecture correction

Active production shape:

```text
Source app authenticated session
-> one-time verification token
-> signed Discord modal submit
-> signed HTTP interactions endpoint hosted by the source app
-> token consumed once
-> durable Discord/source-app link persisted
-> Discord role grant through REST API
-> optional nickname sync from source-app member display state
```

Prototype and fallback only:

- local or standalone Gateway bot process

Production guidance:

- Do not describe the Gateway bot prototype as the active system once the source app hosts the signed Discord interactions endpoint.
- Discord should remain transport and display. The source app should remain identity authority.

## Best final architecture

Source app authenticated session
-> one-time verification token
-> Discord modal submit
-> signed HTTP interactions endpoint
-> token consumed once
-> durable Discord/source-app link
-> Discord role grant through REST API
-> nickname sync if the product uses source-app display numbers

This keeps identity proof anchored in the source app while Discord remains the consumer of that proof.

## When to use

Use when:

- Discord access depends on membership/account status in another app.
- The source app already has authentication and user truth.
- Discord should only grant roles after app-owned verification.

## What not to do

- Do not verify by email-only.
- Do not store raw tokens.
- Do not persist verification tokens in profile/account state.
- Do not let unsigned Discord requests hit role-grant code.
- Do not rely on a local Gateway bot for production availability.
- Do not let auth middleware redirect Discord server routes.
- Do not claim success if Discord role assignment fails.
- Do not let Discord create parallel member identity truth.
- Do not write user bug reports directly into ATLAS or Git history.
- Do not dump raw internal changelog or deploy logs into user-facing Discord posts.

## Implementation checklist

### A. Source app backend

- authenticated token generation endpoint
- hashed token storage
- short TTL
- one-time consume function
- no email returned
- service-role/admin access only where required

### B. Source app UI

- account/settings verification section
- generate token button
- readonly token field
- copy button
- expiry text
- no persistence

### C. Discord app setup

- create Discord app
- configure bot role above target role
- create Verified role
- create verify channel
- set Interactions Endpoint URL
- add Manage Roles permission

### D. HTTP interactions endpoint

- raw body read
- Ed25519 signature verification before JSON parse
- PING response
- button modal response
- modal submit token consume
- REST role grant
- role grant failure does not claim success

### E. Durable link and member display

- persistent Discord/source-app link table
- source-app user id plus Discord user id
- source-app member display snapshot if the product exposes one
- nickname sync status or equivalent sync-state tracking
- resync script if numbers can compact or drift
- audit command if public display numbers are meant to stay clean

### F. Support and release extensions

- bug-report modal writes structured rows into a review queue
- release bot draws from curated release truth, not raw deploy logs
- Playbook or equivalent governance layer promotes reviewed records only
- no automatic repo commits from Discord-originated user input

### G. Deployment

- env vars present in production
- redeploy after env changes
- signed endpoint accepted by Discord
- old Gateway bot stopped

## Gateway bot prototype vs HTTP endpoint

Gateway bot is the fastest prototype because it can wire up commands, buttons, and modal handling quickly.

Gateway bot requires always-running worker hosting. If the bot only lives in a local terminal, the verification flow dies with the process.

HTTP interactions endpoints are better long-term when the source app can host signed Discord requests itself. This keeps the identity authority and the Discord integration in one deployment boundary.

Vercel/serverless-style deployments are suitable for HTTP interaction endpoints, not indefinite Gateway processes.

## Member-number display extension

Use this extension only when Discord should reflect an app-owned public member display number.

- Source app profile number remains the source of truth.
- Persist a Discord link table that records the source-app user id, Discord user id, display-number snapshot, and nickname sync state.
- Nickname sync is a display side effect, not identity proof.
- If the product chooses compact public display slots instead of stable historical numbers, document that explicitly.
- If numbers compact after deletes, provide both an audit command and a resync path for Discord nicknames.

Product choice doctrine:

- Compact public member slots and stable identity numbers are different product choices.
- If the product uses compaction, say so plainly and do not describe the numbers as permanent identity history.

Known Discord limit:

- Server owners and users with equal or higher roles than the bot can verify successfully but still reject nickname updates.
- Verification persistence must not depend on nickname mutation success.

## Support and bug-report extension

Discord can be a structured intake surface, but it should not become repo truth by itself.

- Use a Discord modal or equivalent structured UI.
- Store reports in a database queue owned by the source app or another governed intake service.
- Add rate limits and duplicate fingerprints.
- Require Playbook or another governance layer to triage, dedupe, and promote reviewed work.
- Allow promotion into ATLAS, GitHub, or other durable planning systems only after review.

Rule:
- User reports enter review queues before becoming repo truth.

Pattern:
- Discord modal -> structured queue -> governed triage -> reviewed issue or task

Failure Mode:
- Direct Discord-to-repo writes create noisy, abusive history and fake authority.

## Curated release announcement extension

Discord release posts should be user communication, not internal engineering exhaust.

- Publish only admin-approved copy.
- Include user-visible changes only.
- Exclude raw migration, infra, and internal cleanup noise unless it changes user experience.
- It is acceptable to draw from a release ledger or PR set, but the public message still needs curation.

Rule:
- Release bots post curated user communication, not raw technical logs.

Pattern:
- Internal release truth -> curated public announcement

Failure Mode:
- Raw technical release posts confuse users and leak irrelevant implementation detail.

## Debug matrix

- Endpoint URL could not be verified -> bad public key, route redirect, endpoint not deployed, malformed signature handling
- Application did not respond -> endpoint threw/timed out or old Gateway mode still active
- Modal opens but role not assigned -> missing bot token or role hierarchy issue
- Verification persisted but nickname did not change -> owner target, high-role target, or missing Manage Nicknames
- Token invalid -> expired/reused/wrong token
- Setup command 404 -> app/token mismatch or command registered to wrong guild/app

## Doctrine

Rule: The source app owns identity; Discord consumes proof.
Rule: Discord should display source-app truth, not create parallel truth.
Rule: Email knowledge is not identity proof.
Rule: Discord interaction requests must be signature-verified before parsing.
Rule: One-time verification tokens are ephemeral proof, not account data.
Rule: Production Gateway bots require persistent worker hosting.
Rule: If public member numbers compact, document them as display slots rather than stable identity history.
Rule: User reports enter review queues before becoming repo truth.
Rule: Release bots post curated user communication, not internal deployment logs.
Pattern: Authenticated app session -> one-time token -> Discord modal -> signed endpoint -> token consume -> role grant.
Pattern: Source-app profile number -> Discord link table -> nickname sync.
Pattern: Prototype with Gateway when speed matters; promote to HTTP interactions when availability and app ownership matter.
Pattern: Discord modal -> structured queue -> governed triage -> reviewed task.
Pattern: Internal release truth -> curated public announcement.
Failure Mode: Local-only bots make Discord verification unavailable when the process dies.
Failure Mode: Discord-side state drifts from source-app state.
Failure Mode: Auth middleware redirects make Discord endpoint verification fail before app logic runs.
Failure Mode: Owner or high-role users verify correctly but cannot be renamed by the bot.
Failure Mode: Unsigned request handling turns role grant into a public attack surface.
Failure Mode: Direct Discord-to-repo writes create noisy or abusive history.
Failure Mode: Raw technical release posts are hostile to normal users.
