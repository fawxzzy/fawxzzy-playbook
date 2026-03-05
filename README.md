# Playbook — AI Governance for Software Engineering

[![CI](https://github.com/ZachariahRedfield/playbook/actions/workflows/ci.yml/badge.svg)](https://github.com/ZachariahRedfield/playbook/actions/workflows/ci.yml) ![Version](https://img.shields.io/badge/version-v0.1.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D22-339933)

Playbook is a lightweight governance layer that keeps AI-assisted software changes aligned with real engineering standards.

## Demo

![Playbook demo](docs/demo.gif)

To generate the demo GIF without screen recording, install [VHS](https://github.com/charmbracelet/vhs) and run:

```bash
vhs docs/demo.tape
```

## Quickstart (consumer repo)

```bash
npx playbook init
npx playbook analyze
npx playbook verify
```

> npm publishing is coming soon.

### Try from source (today)

```bash
git clone https://github.com/ZachariahRedfield/playbook.git
cd playbook
pnpm install
pnpm build
pnpm -C packages/cli playbook init
pnpm -C packages/cli playbook analyze
pnpm -C packages/cli playbook verify
```
