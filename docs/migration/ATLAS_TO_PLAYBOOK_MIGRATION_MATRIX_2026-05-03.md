# ATLAS -> Playbook Migration Matrix - 2026-05-03

| Candidate | Bring into Playbook? | Target surface | Why | Guardrail |
| --- | --- | --- | --- | --- |
| Playbook convergence contract | Yes | `docs/contracts`, `exports`, tests | Already Playbook owner truth. | Keep versioned; validate schema. |
| Atlas adoption matrix status vocabulary | Partial | convergence scan/report schema | Reusable for repo-local adoption. | Atlas root keeps stack projection. |
| Fitness/Mazer adoption docs | Template only | `templates/repo/docs/ops/*` | Proven current examples. | Do not copy domain truth. |
| Fitness/Mazer verification reports | Yes, as schema/template | `exports`, `templates`, tests | Needed for measurable convergence. | Scope must be explicit; no broad certification claims. |
| Atlas third-party playbook policy | Yes, as product policy | `docs/contracts`, `docs/commands/pack.md` | Playbook should own playbook-pack intake. | External code stays untrusted until evaluated. |
| Atlas playbook ingest pipeline | Yes, as command architecture | `pack import/evaluate/normalize/catalog` | Mature import/evaluate/normalize/catalog sequence. | No active repo mutation during intake. |
| Atlas mission context | No | reference only | It is stack strategy. | Avoid second source of truth. |
| Awareness-first world model | Partial | convergence principles/checks | No-dark-state and intent-routing are reusable. | Keep Atlas world model and runtime paths in Atlas. |
| ATLAS/CORTEX/Playbook/Codex boundary doc | Reference only | architecture reference | Prevents Playbook overreach. | Do not redefine owner domains in a conflicting doc. |
| Lifeline export loader | Compatibility target | export tests/docs | Concrete consumer boundary. | Do not move execution/approval into Playbook. |
| Lifeline verify notes | Pattern only | docs/check templates | Strong CI merge-gate lesson. | Keep Lifeline runtime details local. |
| Supabase Fitness schema | Future adapter only | production observation evidence schema | Production surface can be evidence. | No secrets, no data rows, no owner truth rewrite. |
| Mazer `PLAYBOOK.md` local rules | No | examples/reference | App-specific local operational rules. | Keep app-local playbook in app repo. |
| Atlas initiative JSON | No | source ref only | It is root portfolio memory. | Playbook can report; Atlas owns initiative truth. |

## First migration slice

Recommended first PR-sized slice:

1. Add this migration matrix and restart roadmap to Playbook docs.
2. Add `playbook.convergence.source-inventory.schema.v1.json` and example export.
3. Append feature ids to `docs/roadmap/ROADMAP.json`.
4. Add engine-only source classifier tests.
5. Defer CLI wiring until the artifact contract is reviewed.

## First command slice after docs

`pnpm playbook convergence scan --repo <path> --json`

Minimum output:

- repo id/path,
- claimed contract id/version,
- owner refs,
- adoption evidence refs,
- verification report refs,
- implemented checks,
- not-applicable checks,
- missing checks,
- trust posture,
- next actions.
