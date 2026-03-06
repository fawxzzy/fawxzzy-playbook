# Testing Guidelines

All new Playbook CLI commands and rule-engine rules must include tests at creation time.

## Unit tests

Each new CLI command module must include a command-local unit test file:

- Source: `packages/cli/src/commands/<command>.ts`
- Test: `packages/cli/src/commands/<command>.test.ts`

Examples:

- `status.ts` → `status.test.ts`
- `plan.ts` → `plan.test.ts`
- `apply.ts` → `apply.test.ts`

Unit tests should validate command behavior for:

- expected success output
- expected failure output
- structured JSON output where supported
- exit code behavior

## Integration tests

Rule-engine interactions must include integration coverage for command-to-rule and rule-to-task execution paths.

Required scenarios:

- `verify` → rule execution
- `plan` → rule → task mapping
- `apply` → fix handler execution

Integration tests should validate rule IDs, findings, and remediation/fix behavior in realistic repo states.

## Smoke tests

End-to-end CLI workflows must be exercised by `scripts/smoke-test.mjs`.

At minimum, smoke coverage must include:

- `init`
- `status`
- `plan`
- `apply`
- `verify`

## CI enforcement

CI enforces this policy with `scripts/check-tests.mjs`.

The check fails when a newly added CLI command file or verify-rule file is missing a corresponding test file.

## Verify rule

`verify.rule.tests.required` is a core verify rule that fails verification when changed command/rule files do not have required tests.
