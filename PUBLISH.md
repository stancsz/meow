# Publishing MEOW to npm

This guide covers everything needed to publish MEOW as a public npm package.

---

## Prerequisite: npm Account

1. Create an account at [npmjs.com](https://www.npmjs.com)
2. Enable 2FA (required for publishing)
3. Claim the `meow` or `meow-agent` package name

> ⚠️ The name `meow` is already taken on npm. Options:
> - `meow-agent` (used in README install instructions)
> - `@meow/core` (scoped package)
> - `@stancsz/meow` (scoped with your GitHub username)
>
> Check availability: `npm view meow-agent` vs `npm view meow`

---

## Step 1: Prepare the Package

### 1a. Install dependencies

```bash
cd meow
npm install
```

### 1b. Run all checks

```bash
npm run check   # tsc --noEmit + ESLint
npm run test    # vitest run
```

### 1c. Verify the bin works

```bash
npx tsx src/index.ts --version
# or
node src/index.js --version
```

### 1d. Build a compiled JavaScript version (optional but recommended)

```bash
# Install tsup for fast compilation
npm install --save-dev tsup

# Add to package.json scripts:
# "build": "tsup src/index.ts --out-dir dist"

npx tsup src/index.ts --out-dir dist --format esm --no-external-local
```

This produces `dist/index.js` which is faster to load than `tsx`.

Update `bin` in `package.json`:
```json
{
  "bin": {
    "meow": "./dist/index.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  }
}
```

---

## Step 2: Version Management

MEOW uses **semantic versioning** (semver):

| Increment | When to use | Example |
|-----------|-------------|---------|
| `PATCH` | Bug fixes, no breaking changes | 0.1.0 → 0.1.1 |
| `MINOR` | New features, backward compatible | 0.1.0 → 0.2.0 |
| `MAJOR` | Breaking changes | 0.1.0 → 1.0.0 |

```bash
# Bump version
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm version major   # 0.1.0 → 1.0.0

# This creates a git commit + tag automatically
```

Also update `CHANGELOG.md` before publishing with the new version.

---

## Step 3: Add .npmignore

Create `.npmignore` to exclude files from the package:

```
node_modules/
src/
*.ts
*.map
.tsup.config.ts
vitest.config.ts
.git/
.github/
.context/
memory/
scratch/
*.bak
*.ts.bak
*.ts.v2
```

This ensures only compiled JS + necessary files land in the npm package.

---

## Step 4: Login to npm

```bash
npm login
# Enter username, password, and 2FA code
```

Verify you're logged in:
```bash
npm whoami
```

---

## Step 5: Publish

### For a scoped package (`@stancsz/meow`)

```bash
# Requires `access: public` for scoped packages
npm publish --access public
```

### For an unscoped package (`meow-agent`)

```bash
npm publish
```

### Dry run (test without actually publishing)

```bash
npm publish --dry-run
```

### Verify what will be published

```bash
npm pack --dry-run
```

This shows the exact `.tgz` that will be uploaded.

---

## Step 6: After Publishing

### Verify the package is live

```bash
npm view meow-agent
# or
npm view @stancsz/meow
```

### Tag the commit

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Update GitHub release

Create a GitHub release at:
https://github.com/stancsz/meow/releases/new

Copy the changelog entry for this version.

---

## CI/CD: Automated Publishing via GitHub Actions

Add `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm install

      - run: npm test

      - run: npm run build

      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Get NPM_TOKEN

1. Go to [npmjs.com](https://www.npmjs.com) → Account → Access Tokens
2. Create an **Automation** token (can publish any package without 2FA)
3. Add to GitHub repo: Settings → Secrets → `NPM_TOKEN`

Now every `git tag v*.*.*` pushed to GitHub will:
1. Run tests
2. Build the package
3. Publish to npm automatically

---

## Package Name Options (Decision)

| Name | Status | Recommended? |
|------|--------|-------------|
| `meow` | ❌ Taken | No |
| `meow-agent` | ✅ Available | **Yes** — clear, matches README install command |
| `@stancsz/meow` | ✅ Available | Good if you want scoped + personal brand |
| `@meow/core` | ✅ Available | Good for ecosystem (`@meow/cli`, `@meow/sdk`) |

Recommend: **`meow-agent`** — available, clear, works with `npm install -g meow-agent`.

---

## npm Organization (optional)

If you want an organization (e.g., `@meow-ai`):
- Free at npmjs.com
- Allows multiple packages: `@meow-ai/cli`, `@meow-ai/core`, `@meow-ai/sdk`

Set package name in `package.json` accordingly:
```json
{
  "name": "@meow-ai/cli",
  "version": "0.1.0"
}
```
