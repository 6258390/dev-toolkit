# Dev Toolkit

Monorepo automation toolkit for managing packages, templates, versioning, and publishing.

## Quick Start

Initialize a new monorepo in your current directory:

```bash
npx github:6258390/dev-toolkit init
```

This will set up:
- `packages/` folder for your npm packages
- `templates/` folder for app templates
- `package.json` with workspaces configuration
- `.github/workflows/publish.yml` for auto-publishing
- Git hooks for automatic version bumping

## Commands

### `dev-toolkit init`

Initialize monorepo structure in current directory.

```bash
npx github:6258390/dev-toolkit init
```

Creates:
```
my-project/
├── .github/workflows/publish.yml
├── .gitignore
├── package.json
├── packages/
│   └── .gitkeep
└── templates/
    └── .gitkeep
```

---

### `dev-toolkit lint [--fix]`

Run linter on your codebase.

```bash
# Check only
npm run lint

# Auto-fix + check
npm run lint:fix
# or
dev-toolkit lint --fix
```

Requires `lint` and `lint:fix` scripts in your `package.json`.

---

### `dev-toolkit bump`

Auto-bump package versions based on git staged changes.

```bash
git add .
dev-toolkit bump
```

**What it does:**
1. Detects staged files in `packages/*`
2. Bumps package version (patch) if files changed
3. Syncs dependencies in `templates/*`
4. Bumps template versions if needed
5. Auto `git add` all bumped `package.json` files

**Example:**
```bash
# Edit packages/my-package/index.js
git add packages/my-package/

dev-toolkit bump
# → packages/my-package: 1.0.0 → 1.0.1
# → templates/my-app: dependency updated + version bumped
```

---

### `dev-toolkit publish`

Publish packages and templates to NPM (only if version changed).

```bash
dev-toolkit publish
```

**What it does:**
1. Detects version changes via `git diff HEAD~1`
2. Publishes packages with `--access public`
3. Publishes templates (with `.gitignore` rename workaround)

**Note:** Requires `NODE_AUTH_TOKEN` environment variable set.

---

### `dev-toolkit prepare`

Setup git pre-commit hook for automatic linting and version bumping.

```bash
npm run prepare
# or
dev-toolkit prepare
```

Creates `.git/hooks/pre-commit` that runs on every commit:
1. `npm install` (ensure dev-toolkit is available)
2. `dev-toolkit lint --fix` (auto-fix and check)
3. `dev-toolkit bump` (auto-bump versions)

---

## Workflow

### Development Workflow

```bash
# 1. Initialize monorepo
npx github:6258390/dev-toolkit init

# 2. Create your first package
mkdir packages/my-package
cd packages/my-package
npm init -y

# 3. Make changes and commit
git add .
git commit -m "feat: add my-package"
# → Pre-commit hook auto-bumps version!

# 4. Push to trigger publish
git push origin master
# → GitHub Actions auto-publishes to NPM
```

### CI/CD Workflow

The `publish.yml` workflow automatically runs on push to `master`:

```yaml
name: Publish to NPM

on:
  push:
    branches: [master]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: dev-toolkit publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Monorepo Structure

```
my-monorepo/
├── .github/
│   └── workflows/
│       └── publish.yml          # Auto-publish on push
├── .git/
│   └── hooks/
│       └── pre-commit           # Auto-lint + bump
├── packages/
│   ├── package-a/
│   │   ├── package.json         # Auto-bumped on changes
│   │   └── index.js
│   └── package-b/
│       ├── package.json
│       └── index.js
├── templates/
│   └── my-app/
│       ├── package.json         # Dependencies auto-synced
│       └── index.js
├── .gitignore
└── package.json                 # Workspaces config
```

---

## package.json Configuration

After `dev-toolkit init`, your root `package.json`:

```json
{
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "prepare": "dev-toolkit prepare"
  },
  "devDependencies": {
    "dev-toolkit": "github:6258390/dev-toolkit"
  }
}
```

---

## Requirements

- Node.js 18+
- Git repository
- NPM account (for publishing)

---

## License

MIT

---

## Contributing

Issues and PRs welcome at [github.com/6258390/dev-toolkit](https://github.com/6258390/dev-toolkit)
