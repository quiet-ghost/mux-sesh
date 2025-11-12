# Release Guide

This document explains how to use the GitHub Actions workflows to release new versions of mux-sesh.

## 📋 Prerequisites

Before you can release, you need to set up:

### 1. npm Account & Token

1. Create an npm account at https://www.npmjs.com/signup (if you don't have one)
2. Go to https://www.npmjs.com/settings/tokens
3. Click "Generate New Token" → "Classic Token"
4. Choose "Automation" type
5. Copy the token

### 2. Add npm Token to GitHub

1. Go to your GitHub repo: https://github.com/quiet-ghost/mux-sesh
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

### 3. Verify Package Name

Make sure `mux-sesh` is available on npm:
```bash
npm view mux-sesh
# Should return "404 Not Found" if available
```

If taken, update `package.json` to use a scoped name like `@yourname/mux-sesh`.

## 🚀 How to Release

### Option 1: Manual Release (Recommended)

1. **Go to GitHub Actions**
   - Navigate to: https://github.com/quiet-ghost/mux-sesh/actions
   - Click on **"Publish to npm"** workflow

2. **Run the workflow**
   - Click **"Run workflow"** button
   - Select branch: `opentui-convert` (or `main` when merged)
   - Choose version bump:
     - **patch**: 0.1.0 → 0.1.1 (bug fixes)
     - **minor**: 0.1.0 → 0.2.0 (new features)
     - **major**: 0.1.0 → 1.0.0 (breaking changes)
   - Click **"Run workflow"**

3. **What happens automatically:**
   - ✅ Installs dependencies
   - ✅ Runs type checking
   - ✅ Bumps version in package.json
   - ✅ Builds the project
   - ✅ Commits version bump
   - ✅ Creates git tag
   - ✅ Publishes to npm
   - ✅ Pushes tag to GitHub
   - ✅ Creates GitHub Release

4. **Verify the release:**
   ```bash
   # Check npm
   npm view mux-sesh
   
   # Install and test
   bun install -g mux-sesh@latest
   mux-sesh --version
   ```

### Option 2: Manual Release (Command Line)

If you prefer to do it manually:

```bash
# 1. Make sure you're on the right branch
git checkout opentui-convert
git pull

# 2. Run type check
bun run typecheck

# 3. Bump version (choose one)
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm version major   # 0.1.0 → 1.0.0

# 4. Build
bun run build

# 5. Login to npm (one-time)
npm login

# 6. Publish
npm publish

# 7. Push tags
git push --follow-tags
```

## 📊 Version Numbering Guide

Use [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes, backwards compatible

### Examples:

| Change | Version | Bump Type |
|--------|---------|-----------|
| Fix search bug | 0.1.0 → 0.1.1 | patch |
| Add new keybinding | 0.1.0 → 0.2.0 | minor |
| Change config format | 0.1.0 → 1.0.0 | major |
| Improve performance | 0.1.0 → 0.1.1 | patch |
| Add GitHub integration | 0.1.0 → 0.2.0 | minor |

## 🔄 Automated CI/CD Workflows

### What Runs Automatically

#### On Every Push/PR:
- **Type Check** - Ensures TypeScript compiles
- **Test** - Runs test suite (when tests exist)
- **Format Check** - Checks code formatting (on PRs only)

#### On Manual Trigger:
- **Publish to npm** - Full release workflow

### Workflow Files

Located in `.github/workflows/`:

- `publish.yml` - Release workflow (manual trigger)
- `typecheck.yml` - Type checking (auto on push/PR)
- `test.yml` - Test suite (auto on push/PR)
- `format.yml` - Format checking (auto on PR)

## 📝 Changelog Best Practices

Update `CHANGELOG.md` before each release:

```markdown
## [0.2.0] - 2025-01-15

### Added
- New session detail panel with full window information
- Search term highlighting

### Changed
- Improved fuzzy search algorithm

### Fixed
- Session kill command not working
- Rename mode input focus issue
```

## 🐛 Troubleshooting

### "npm publish" fails

**Error:** `ENEEDAUTH`
- **Fix:** Make sure `NPM_TOKEN` secret is set in GitHub

**Error:** `EPUBLISHCONFLICT`
- **Fix:** Version already published. Bump version higher.

**Error:** `E403`
- **Fix:** You don't have permission. Make sure you're the owner or have publish rights.

### Workflow fails at "Type check"

- **Fix:** Run `bun run typecheck` locally first
- Fix any TypeScript errors before releasing

### Version not bumping

- **Fix:** Make sure you selected the right bump type (major/minor/patch)
- Check if version was already at that number

### Tag already exists

```bash
# Delete local tag
git tag -d v0.1.0

# Delete remote tag
git push origin :refs/tags/v0.1.0

# Then re-run the workflow
```

## 📦 First Release Checklist

Before your first release:

- [ ] Test the app thoroughly
- [ ] Update README.md with installation instructions
- [ ] Update CHANGELOG.md with initial changes
- [ ] Verify package.json metadata (description, keywords, etc.)
- [ ] Set up npm account and token
- [ ] Add NPM_TOKEN secret to GitHub
- [ ] Test with `npm pack` locally
- [ ] Do a test publish to see if everything works
- [ ] Announce the release!

## 🎯 Release Schedule

Suggested release cadence:

- **Patch releases**: As needed for bug fixes
- **Minor releases**: Every 2-4 weeks for new features
- **Major releases**: When you have breaking changes

## 🔗 Useful Links

- [npm Package Page](https://www.npmjs.com/package/mux-sesh) (after first publish)
- [GitHub Releases](https://github.com/quiet-ghost/mux-sesh/releases)
- [GitHub Actions](https://github.com/quiet-ghost/mux-sesh/actions)
- [Semantic Versioning](https://semver.org/)

## 📞 Need Help?

If you run into issues:

1. Check the [GitHub Actions logs](https://github.com/quiet-ghost/mux-sesh/actions)
2. Review this guide
3. Check npm documentation: https://docs.npmjs.com/
4. Open an issue in the repo

---

**Happy Releasing! 🎉**
