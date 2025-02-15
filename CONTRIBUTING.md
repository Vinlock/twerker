# Contributing to Twerker

Thank you for your interest in contributing to Twerker! This document will guide you through the contribution process.

## 🚀 Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a new branch:
   ```bash
   git checkout -b my-feature
   ```

## 📝 Making Changes

1. Make your changes
2. Run tests:
   ```bash
   pnpm test
   ```
3. Format code:
   ```bash
   pnpm format
   ```
4. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add new feature"
   ```

## 🔄 Pull Request Process

1. Push your changes to your fork
2. Create a Pull Request to the `main` branch
3. Ensure your PR title follows the [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat(scope): description` for features
   - `fix(scope): description` for bug fixes
   - `docs(scope): description` for documentation
   - `refactor(scope): description` for refactors
   - etc.

## 📦 Changesets

We use [changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

### For External Contributors

Don't worry about creating changesets! Our maintainers will:
1. Review your PR
2. Add appropriate changesets
3. Handle version bumps
4. Generate changelog entries

### For Team Members

If you're a team member, you should add a changeset with your PR:

1. Create a changeset:
   ```bash
   pnpm changeset
   ```

2. Select the type of change:
   - `major` for breaking changes
   - `minor` for new features
   - `patch` for bug fixes

3. Write a description of your changes
   ```md
   ---
   "twerker": minor
   ---

   Added new feature that does something awesome
   ```

4. Commit the generated `.changeset/*.md` file

## 🔖 Release Process

1. PRs are merged into `main`
2. Changesets automatically creates a "Version Packages" PR
3. When the "Version Packages" PR is merged:
   - Versions are bumped
   - Changelog is generated
   - Changes are published to npm
   - GitHub release is created

## 🤝 Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## ❓ Questions?

If you have questions, feel free to:
- Open a [Discussion](https://github.com/dakdevs/twerker/discussions)
- Ask in the PR comments
- Reach out to maintainers

Thank you for contributing! 🙏 