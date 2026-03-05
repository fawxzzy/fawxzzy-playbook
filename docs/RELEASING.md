# Releasing Playbook to npm

## 1) Prepare the release

1. Update package versions in:
   - `package.json`
   - `packages/core/package.json`
   - `packages/node/package.json`
   - `packages/engine/package.json`
   - `packages/cli/package.json`
2. Update `CHANGELOG.md` with WHAT/WHY for the release.
3. Run verification locally:

```bash
pnpm -r build
pnpm -r test
pnpm smoke
```

## 2) Commit and tag

```bash
git checkout main
git pull --ff-only
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

## 3) Publish

Publishing is automated by `.github/workflows/publish-npm.yml` on `v*` tags.

Manual fallback (if needed):

```bash
pnpm -C packages/core publish --access public
pnpm -C packages/node publish --access public
pnpm -C packages/engine publish --access public
pnpm -C packages/cli publish --access public
```

> Scoped npm packages default to private; always publish with `--access public`.
