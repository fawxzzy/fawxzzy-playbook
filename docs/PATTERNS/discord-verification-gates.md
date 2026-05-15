# Discord Verification Gates

## Purpose

A reusable pattern for Discord access gates where another app is the identity authority.

## Best final architecture

Source app authenticated session
-> one-time verification token
-> Discord modal submit
-> signed HTTP interactions endpoint
-> token consumed once
-> Discord role grant through REST API

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

### E. Deployment

- env vars present in production
- redeploy after env changes
- signed endpoint accepted by Discord
- old Gateway bot stopped

## Gateway bot prototype vs HTTP endpoint

Gateway bot is the fastest prototype because it can wire up commands, buttons, and modal handling quickly.

Gateway bot requires always-running worker hosting. If the bot only lives in a local terminal, the verification flow dies with the process.

HTTP interactions endpoints are better long-term when the source app can host signed Discord requests itself. This keeps the identity authority and the Discord integration in one deployment boundary.

Vercel/serverless-style deployments are suitable for HTTP interaction endpoints, not indefinite Gateway processes.

## Debug matrix

- Endpoint URL could not be verified -> bad public key, route redirect, endpoint not deployed, malformed signature handling
- Application did not respond -> endpoint threw/timed out or old Gateway mode still active
- Modal opens but role not assigned -> missing bot token or role hierarchy issue
- Token invalid -> expired/reused/wrong token
- Setup command 404 -> app/token mismatch or command registered to wrong guild/app

## Doctrine

Rule: The source app owns identity; Discord consumes proof.
Rule: Email knowledge is not identity proof.
Rule: Discord interaction requests must be signature-verified before parsing.
Rule: One-time verification tokens are ephemeral proof, not account data.
Rule: Production Gateway bots require persistent worker hosting.
Pattern: Authenticated app session -> one-time token -> Discord modal -> signed endpoint -> token consume -> role grant.
Pattern: Prototype with Gateway when speed matters; promote to HTTP interactions when availability and app ownership matter.
Failure Mode: Local-only bots make Discord verification unavailable when the process dies.
Failure Mode: Auth middleware redirects make Discord endpoint verification fail before app logic runs.
Failure Mode: Unsigned request handling turns role grant into a public attack surface.
