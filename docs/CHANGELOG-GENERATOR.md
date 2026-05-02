# Playbook Changelog Generator

## Purpose

This document defines the contract for Playbook's deterministic changelog generator work. The generator is intended to turn local git history and release metadata into structured changelog entries that are:

- deterministic
- local-first
- explainable
- safe to use alongside Playbook's existing managed release notes flow

The generator is implemented as engine-first functionality. The engine owns collection, classification, entry building, rendering, validation, and append planning. The CLI and CI surfaces call those engine APIs rather than reimplementing the behavior.

## Current Status

As of the current repo state:

- engine domain types and config defaults exist under `packages/engine/src/release/changelog/`
- `playbook changelog generate`, `playbook changelog validate`, and `playbook changelog append` are wired through the Playbook CLI
- CI integration for changelog generation/validation is present through `.github/workflows/changelog.yml`
- append behavior is active through the CLI and fails closed for managed changelog targets unless a safe generated seam exists

This means the command contract below is implemented for local CLI use and the same CLI now backs the changelog CI workflow.

## Deterministic Behavior

The changelog generator is intended to be deterministic by design:

- local git history is the primary source of truth
- classification is rule-based, not AI-generated
- WHAT and WHY text are derived from commit/PR text using fixed rules
- category ordering is explicit
- unknown changes remain visible unless configuration excludes them
- generated JSON shape is stable
- append planning must not rewrite unrelated changelog content

The generator should not depend on GitHub API access for core local use.

## Local Command Contract

The current Playbook CLI surface is:

```bash
pnpm playbook changelog generate --base <ref> --format markdown
pnpm playbook changelog generate --base <ref> --format json
pnpm playbook changelog validate --base <ref> --json
pnpm playbook changelog append --base <ref> --file docs/CHANGELOG.md --dry-run
pnpm playbook changelog generate --base <ref> --config .playbook/changelog-config.json --format json
```

Expected command responsibilities:

- `generate`: collect changes, classify them, build WHAT/WHY entries, and render Markdown or JSON
- `validate`: report unknown changes, low-confidence classifications, breaking changes, security-related changes, invalid config, or empty output according to policy
- `append`: plan or apply a safe changelog insertion without corrupting Playbook-managed release notes

Supported config usage:

- default config path: `.playbook/changelog-config.json`
- custom config path: `pnpm playbook changelog generate --base HEAD~1 --config ./tmp/changelog.custom.json --format json`
- CLI flag overrides are applied after config loading and final validation

Current repo status:

- `playbook release plan` and `playbook release sync` already exist
- `playbook changelog` is implemented in the current tree
- `playbook changelog --config <path>` is implemented for repo-local or custom JSON config loading
- `playbook changelog append --file docs/CHANGELOG.md --dry-run` blocks by default when the managed release-notes seam would be ambiguous

## WHAT + WHY Entry Format

Every generated changelog entry should follow a structured WHAT + WHY shape:

```md
- **WHAT:** Added a deterministic changelog classifier for conventional commits.
  **WHY:** Makes release-note generation explainable and repeatable across local and CI runs.
  Source: abc1234
```

Generation rules:

- `WHAT` comes from a cleaned change title
- conventional prefixes such as `feat:` or `fix:` are removed from `WHAT`
- scope should be preserved when useful
- ticket IDs remain unless configuration says to remove them
- `WHY` prefers explicit rationale lines such as `Why:`, `WHY:`, `Rationale:`, or `Motivation:`
- if no explicit rationale exists, `WHY` falls back to a deterministic category-specific sentence

## Categories

The default category set is:

- `feature`
- `fix`
- `refactor`
- `docs`
- `infra`
- `test`
- `security`
- `performance`
- `chore`
- `unknown`

Default display order is:

1. `feature`
2. `fix`
3. `security`
4. `performance`
5. `refactor`
6. `docs`
7. `test`
8. `infra`
9. `chore`
10. `unknown`

## Config Defaults

Wave 1A introduced default engine config for the generator. The current defaults are:

- `includeUnknown: true`
- `failOnUnknown: false`
- `includeSourceRefs: true`
- `includeAuthors: false`
- `lowConfidenceThreshold: 0.3`
- `requireChanges: false`
- `markdownHeading: "# Changelog"`
- `defaultTargetFile: "docs/CHANGELOG.md"`
- `removeTicketIds: false`

Default conventional commit mappings include:

- `feat` and `feature` -> `feature`
- `fix` -> `fix`
- `refactor` -> `refactor`
- `docs` and `doc` -> `docs`
- `test` and `tests` -> `test`
- `chore` -> `chore`
- `perf` and `performance` -> `performance`
- `security` and `sec` -> `security`
- `build`, `ci`, `deps`, and `dependency` -> `infra`

Default keyword and path rules currently include:

- security-oriented keywords -> `security`
- performance-oriented keywords -> `performance`
- bug/regression keywords -> `fix`
- `docs/**` and `README.md` -> `docs`
- `tests/**`, `test/**`, `**/*.test.ts`, and `**/*.spec.ts` -> `test`
- `.github/**`, `scripts/**`, and `pnpm-lock.yaml` -> `infra`
- `packages/cli/src/commands/**` -> `feature`
- `packages/engine/src/**` -> `feature` as a weak default signal

The weak `packages/engine/src/**` rule is important: it should not override stronger signals from titles, labels, or conventional prefixes.

## Repo Config

Playbook now ships a repo-specific changelog config at:

- `.playbook/changelog-config.json`

This config keeps engine behavior deterministic while making path classification match the real repository layout. Current repo-specific rules include:

- `docs/**` and `README.md` -> `docs`
- `tests/**`, `test/**`, `**/*.test.ts`, and `**/*.spec.ts` -> `test`
- `.github/**`, `scripts/**`, `pnpm-lock.yaml`, `package.json`, and `packages/*/package.json` -> `infra`
- `packages/cli/src/commands/**` -> `feature`
- `packages/engine/src/release/**` -> `feature`
- `packages/engine/src/**` -> `feature` as a weak fallback
- `packages/contracts/src/**` -> `feature`

Current repo-specific security markers extend the defaults with:

- `token leak`
- `credential leak`

The config file is loaded by the engine first, then CLI flags such as `--include-unknown`, `--fail-on-unknown`, and `--low-confidence-threshold` override the loaded values.

## Validation Workflow

The planned validation flow is:

1. Collect the requested change range.
2. Classify each change with reasons and confidence.
3. Build normalized WHAT/WHY entries.
4. Validate the result against policy.

Validation is expected to report:

- invalid changelog config
- no changes found when policy requires changes
- unknown entries when policy fails on unknown
- low-confidence classifications
- breaking changes
- security-related changes
- empty generated output

Validation should remain machine-readable so CI and operators can act on the same diagnostics.

## Append Safety Model

Append behavior must be conservative because `docs/CHANGELOG.md` is already a protected Playbook surface.

Current repo state:

- `docs/CHANGELOG.md` contains the managed markers
  - `<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->`
  - `<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->`
- existing `playbook release plan` / `playbook release sync` behavior already owns that managed block

Generator append behavior therefore must follow these rules:

- never remove, rewrite, or reorder the managed release-notes block
- prefer dry-run before write behavior
- detect duplicate generated sections for the same ref range or version
- fail closed if a safe insertion location cannot be determined
- keep append planning separate from direct file mutation logic
- when a generated seam exists, replace only that seam and preserve the managed release-notes block

Generated seam policy:

- optional explicit seam markers:
  - `<!-- PLAYBOOK:GENERATED_CHANGELOG_START -->`
  - `<!-- PLAYBOOK:GENERATED_CHANGELOG_END -->`
- if those markers exist, append planning replaces only that region
- malformed seam markers block append planning
- a generated seam must not overlap the managed release-notes block

The CLI now uses the append planner directly, but the managed `docs/CHANGELOG.md` target still blocks by default unless a clearly safe generated seam already exists.

## Relationship to `docs/CHANGELOG.md`

`docs/CHANGELOG.md` is not a free-form append target.

It already serves as:

- the durable changelog surface for the repository
- the home of a Playbook-managed release notes block used by release planning/sync
- a governance-relevant documentation surface referenced elsewhere in the repo

The changelog generator must integrate with that file carefully. A generated changelog section may coexist with the managed release-notes block, but only if insertion is explicit and safe. If the generator cannot prove that, it should block instead of mutating the file.

## Relationship to `playbook release plan` and `playbook release sync`

The generator is not a replacement for Playbook's existing release workflow.

Current release ownership remains:

- `playbook release plan` produces reviewed release mutation intent
- `playbook release sync` reconciles version/changelog drift through the governed apply boundary
- the managed release-notes block in `docs/CHANGELOG.md` is already part of that workflow

The changelog generator is intended to complement that flow by providing:

- deterministic WHAT/WHY summaries from local change history
- validation of changelog quality before release work
- optional append planning that respects the existing managed release boundary

## CI Workflow

Playbook now ships a dedicated changelog workflow at:

- `.github/workflows/changelog.yml`

The workflow uses the implemented Playbook CLI rather than duplicating changelog logic in YAML.

Pull request behavior:

- checks out the repository with `fetch-depth: 0`
- installs dependencies with the same pnpm/node setup used by other repo workflows
- builds the workspace before running changelog validation
- attempts to fetch `origin/${github.base_ref}`
- runs:
  - `pnpm playbook changelog validate --base origin/<base_ref> --head HEAD --json`
- uploads either validation output or a machine-readable skip artifact when the base ref is unavailable

Manual workflow behavior:

- exposed through `workflow_dispatch`
- inputs:
  - `base` (default `HEAD~1`)
  - `head` (default `HEAD`)
  - `format` (`markdown` or `json`, default `markdown`)
- runs:
  - `pnpm playbook changelog generate --base <base> --head <head> --format <format> --out .playbook/changelog-ci-output.<ext>`
- uploads the generated artifact from `.playbook/changelog-ci-output.md` or `.playbook/changelog-ci-output.json`

Important CI constraints:

- CI validates and generates only
- CI does not append to `docs/CHANGELOG.md`
- local CLI behavior remains the source of truth
- no GitHub API dependency is required for core changelog classification/rendering

Fetch-depth note:

- pull request validation needs enough history to resolve the requested git range
- the workflow uses `fetch-depth: 0` and an explicit `git fetch origin <base_ref>` before validation

Artifact note:

- PR runs upload `.playbook/changelog-validation.json` when validation executes
- PR runs upload `.playbook/changelog-validation-skip.json` when base-ref resolution is unavailable
- manual runs upload the generated changelog artifact only

## Example Markdown Output

```md
# Changelog

## Features

- **WHAT:** add deterministic changelog validation output
  **WHY:** Adds a machine-readable quality gate for release-note generation.
  Source: abc1234

## Fixes

- **WHAT:** preserve managed release-note markers during append planning
  **WHY:** Corrects unsafe changelog mutation behavior.
  Source: def5678

## Security

- **WHAT:** flag secret leak markers during classification
  **WHY:** Reduces the chance of shipping security-relevant changes without explicit review.
  Source: 9012fed
```

## Example JSON Output

```json
{
  "schemaVersion": "1.0",
  "kind": "playbook-changelog",
  "baseRef": "v0.42.0",
  "headRef": "HEAD",
  "sections": [
    {
      "category": "feature",
      "entries": [
        {
          "category": "feature",
          "what": "add deterministic changelog validation output",
          "why": "Adds a machine-readable quality gate for release-note generation.",
          "sourceRefs": [
            "abc1234"
          ],
          "breakingChange": false,
          "securityRelated": false
        }
      ]
    }
  ]
}
```
