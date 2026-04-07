# Research Compendium

## Purpose

`.playbook/memory/knowledge/research-compendium.json` is a deterministic knowledge artifact for consolidating reusable ideas first surfaced in project chats.

The artifact exists to move repeated insights out of conversation history and into a stable memory surface that Playbook can inspect, review, and extend later.

Rule: exploration is chat-native, but reuse must be artifact-native.

## Categories

### Patterns

Patterns capture repeatable ways of working.

Use a pattern entry when the insight describes a reusable workflow shape, operating ladder, or consolidation habit that should be repeated in future work.

### Rules

Rules capture mandatory constraints or operating boundaries.

Use a rule entry when the insight says what must be preferred, required, or avoided during repository work.

### Failure Modes

Failure modes capture recognizable ways the workflow degrades.

Use a failure mode entry when the insight describes drift, fragmentation, misleading validation, or another repeatable way good process breaks down.

### Open Questions

Open questions capture unresolved decisions that were exposed by the research but not settled in the same conversation.

Use an open question entry when the discussion identifies a real gap that should shape future consolidation or review work.

## Entry Shape

The schema is intentionally small and stable:

- `patterns`: `{ id, name, description, applicability, source }`
- `rules`: `{ id, name, description, applicability, source }`
- `failure_modes`: `{ id, name, description, applicability, source }`
- `open_questions`: `{ id, question, context, source }`

Guidelines:

- Keep ids deterministic and slug-like.
- Keep descriptions concise and reusable.
- Keep `applicability` focused on when the entry matters.
- Keep `source` tied to the conversation surface that produced the insight.
- Merge near-duplicates into one stronger canonical entry instead of recording multiple weak variants.

## How To Extend

When future research appears in chats:

1. Extract candidate patterns, rules, failure modes, and unresolved questions from the conversation.
2. Deduplicate against existing entries and strengthen the surviving entry rather than appending a synonym.
3. Preserve the simplest source reference that still explains where the idea came from.
4. Update `.playbook/memory/knowledge/research-compendium.json` in deterministic order.
5. Keep this document aligned if category meaning or extension guidance changes.

Pattern: convert repeated insights into deterministic artifacts before trying to operationalize them.

Failure Mode: letting valuable research stay scattered across chats instead of promoting it into canonical memory.
