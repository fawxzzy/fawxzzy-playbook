# `pnpm playbook patterns`

Inspect pattern knowledge graph artifacts and run explicit promotion review decisions.

## Subcommands

### `patterns list`

List all pattern nodes from `.playbook/memory/knowledge/patterns.json`.

### `patterns show <id>`

Show one pattern node by knowledge id.

### `patterns related <id>`

Show patterns connected to a pattern id through deterministic relations:

- `supersedes`
- `superseded-by`
- `same-module`
- `same-rule`
- `same-failure-shape`

### `patterns layers`

Summarize graph layers (status, module, rule, and failure-shape distributions).

### `patterns promote --id <pattern-id> --decision approve|reject`

Apply explicit local promotion decisions for compacted pattern candidates.

## Guarantees

- Rule: New CLI knowledge surfaces begin as inspection tools.
- Pattern: Query-first CLI design keeps the command surface understandable and reduces governance risk.
- Failure Mode: Adding write semantics too early causes unclear ownership boundaries between curated and derived artifacts.

## Examples

```bash
pnpm playbook patterns list --json
pnpm playbook patterns show <id> --json
pnpm playbook patterns related <id> --json
pnpm playbook patterns layers --json
pnpm playbook patterns promote --id <pattern-id> --decision approve --json
```
