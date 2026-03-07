# `playbook docs audit`

`playbook docs audit` validates Playbook documentation governance using deterministic, path-based checks.

## Usage

```bash
playbook docs audit
playbook docs audit --json
playbook docs audit --ci --json
```

## Checks (v1)

1. Required documentation anchors exist.
2. Single strategic roadmap path policy.
3. Idea/planning language leakage outside approved planning surfaces.
4. Documentation responsibility boundary overlap checks.
5. Improvement backlog + archive hygiene checks.
6. Cleanup/migration tracker de-duplication reporting.

## CI behavior

- `--ci` exits non-zero when any `error` findings are present.
- `warning` findings are reported but non-blocking.

## Governance patterns

- Pattern: Documentation governance should be executable through Playbook commands rather than enforced only through prose.
- Pattern: `playbook docs audit` turns documentation architecture into a deterministic repository contract.
- Rule: Playbook repositories should have a single strategic roadmap and a separate improvement backlog.
- Rule: Idea/planning content belongs in approved planning surfaces, not scattered across runtime or workflow docs.
- Failure Mode: Documentation responsibility drift occurs when roadmap, backlog, workflow, and notes content begin overlapping again.
- Failure Mode: Cleanup guidance becomes duplicated when one-off migration docs remain active after governance rules have been formalized.
