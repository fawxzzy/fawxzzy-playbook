# ATLAS -> Playbook Source Inventory - 2026-05-03

## Reviewed source surfaces

| Source | Path / surface | Role for Playbook restart | Migration decision |
| --- | --- | --- | --- |
| ATLAS | `docs/ops/ATLAS-MISSION-CONTEXT.md` | Defines stack mission and Playbook's lane as governance/verification/reusable patterns. | Reference only. Do not copy into Playbook as owner truth. |
| ATLAS | `docs/architecture/AWARENESS-FIRST-WORLD-MODEL.md` | Defines no-dark-state, intent-routed context, operating loop, and memory/receipt boundaries. | Extract reusable principles into Playbook checks where repo-local. Keep root world model in Atlas. |
| ATLAS | `docs/architecture/ATLAS-CORTEX-PLAYBOOK-CODEX.md` | Defines ownership boundaries: Atlas stack root, Cortex read-only coordination, Playbook repo runtime/governance, Codex worker. | Reference as integration boundary. Use to prevent overreach. |
| ATLAS | `docs/ops/ATLAS-PLAYBOOK-CONVERGENCE.md` | Stack-owned convergence roadmap and gates. | Convert gates into Playbook convergence-scan/report concepts; keep stack roadmap in Atlas. |
| ATLAS | `docs/ops/PLAYBOOK-ADOPTION-MATRIX.md` | Current root adoption visibility and evidence refs. | Convert status/evidence vocabulary into Playbook template/report contracts; keep matrix in Atlas. |
| ATLAS | `docs/architecture/PLAYBOOK-INGEST-PIPELINE.md` | Import/evaluate/normalize/catalog/selectively adopt flow for playbook packs. | Migrate as Playbook `pack` command family / schema / policy. |
| ATLAS | `docs/playbooks/THIRD-PARTY-PLAYBOOK-POLICY.md` | Safety/vendor-neutral rules for external packs. | Migrate policy substance into Playbook external pack docs/contracts. |
| ATLAS | `docs/playbooks/PLAYBOOK-CATALOG.md` | Human catalog for imported playbook packs and ATLAS-owned workflow index. | Migrate catalog shape; keep Atlas-specific workflows in Atlas. |
| ATLAS | `docs/memory/initiatives/initiative-playbook-convergence-and-continuity.json` | Active initiative and queue context. | Reference as source of current priority; do not copy as Playbook truth. |
| Playbook | `docs/contracts/PLAYBOOK-CONTRACT.md` | Current owner contract. | Keep canonical and harden. |
| Playbook | `exports/playbook.contract.example.v1.json` | Machine-readable contract export. | Keep canonical and extend with convergence scan/report support. |
| Playbook | `docs/roadmap/ROADMAP.json` | Current machine-readable delivery state. | Append new feature ids after review. |
| Playbook | `docs/PLAYBOOK_PRODUCT_ROADMAP.md` | Product sequencing and mission. | Add restart lane as near-term convergence tooling. |
| Fitness | `docs/ops/FITNESS-PLAYBOOK-ADOPTION.md` | Strong repo-local adoption example. | Convert to template. Keep Fitness truth in Fitness. |
| Fitness | `exports/fitness.playbook.verification.report.v1.json` | Verified report pattern. | Convert report shape into Playbook schema/template. |
| Mazer | `docs/ops/MAZER-PLAYBOOK-ADOPTION.md` | Strong repo-local adoption example with non-applicable checks. | Convert to template. Keep Mazer truth in Mazer. |
| Mazer | `PLAYBOOK.md` | App-local operational playbook. | Reference as local doctrine example; do not migrate content. |
| Lifeline | `src/core/load-playbook-exports.ts` | Concrete consumer of Playbook exports, schema version, export family. | Use for export compatibility checks. Keep runtime execution in Lifeline. |
| Lifeline | `docs/PLAYBOOK_CHECKLIST.md`, `docs/PLAYBOOK_NOTES.md` | CI/verify/receipt lessons. | Extract reusable verify gate pattern. Keep Lifeline execution notes local. |
| Supabase | `FawxzzyFitness` project schema | Production-adjacent structural evidence. | Future provider adapter; evidence-only, no app-data ownership. |

## Scan finding

The highest-confidence Playbook migration candidates are not Atlas mission docs. They are the repeatable contracts and patterns now scattered across Atlas/Fitness/Mazer/Lifeline:

- adoption evidence format,
- verification report format,
- status vocabulary,
- negative-safe trust posture,
- pack ingest/evaluation/normalization/cataloging,
- source inventory artifacts,
- export compatibility checks,
- evidence-backed merge/verify gate rules,
- production observation as structural evidence.

## Boundary finding

Playbook should remain the governance and verification owner. It should not become:

- Atlas root,
- Cortex runtime memory,
- Lifeline execution/approval layer,
- Fitness/Mazer domain doctrine store,
- Supabase data owner,
- a hidden cross-repo mutation runner.
