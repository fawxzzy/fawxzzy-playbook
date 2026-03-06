# Verify rules

## `requireNotesOnChanges`

This rule enforces that when application code paths change, `docs/PLAYBOOK_NOTES.md` must be updated in the same change.

Code paths checked by default:

- `src/**`
- `app/**`
- `server/**`
- `supabase/**`

## Example failure output

```text
✖ Verification failed
Base: origin/main

[requireNotesOnChanges] Code changes require a notes update.
Evidence: src/foo.ts
Fix: Update docs/PLAYBOOK_NOTES.md with a note describing WHAT changed and WHY.
```

## `verify.rule.tests.required`

This rule enforces test coverage for newly added CLI command modules and verify-rule modules.

Validation behavior:

- New command module at `packages/cli/src/commands/<command>.ts` requires `packages/cli/src/commands/<command>.test.ts`
- New verify rule at `packages/engine/src/verify/rules/<rule>.ts` requires `packages/engine/test/<rule>.test.ts`

Example failure output:

```text
[verify.rule.tests.required] Missing test file for command: plan
Evidence: packages/cli/src/commands/plan.ts
Fix: Create packages/cli/src/commands/plan.test.ts
```
