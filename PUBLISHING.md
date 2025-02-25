# Publishing Twerker to npm

Follow these steps to publish your version of Twerker to npm.

## 1. Customize Package Information

Edit the `package.json` file to update with your personal information:

- Update the `name` field if you want to publish under a different package name or a scoped name (e.g., `@yourusername/twerker`)
- Update the `author` field with your name and email
- Update the `repository`, `bugs`, and `homepage` URLs to point to your GitHub repository

## 2. Login to npm

If you haven't already logged in to npm, run:

```bash
npm login
```

Follow the prompts to enter your npm username, password, and email.

## 3. Test Your Package Locally (Optional)

You can test your package locally before publishing:

```bash
# Create a tarball
npm pack

# This will create a file like twerker-2.0.0.tgz
# You can install it in another project with:
npm install /path/to/twerker-2.0.0.tgz
```

## 4. Publish to npm

When you're ready to publish:

```bash
# For a public package
npm publish

# If you're using a scoped package and want it to be public
npm publish --access public
```

## 5. Check Your Package

Once published, you can verify your package on npm:

- Visit `https://www.npmjs.com/package/twerker` (or your package name)
- Try installing it in a new project: `npm install twerker`

## Updating Your Package

To publish updates in the future:

1. Make your changes
2. Update the version in `package.json` (follow [semantic versioning](https://semver.org/))
3. Run tests: `npm test`
4. Build the package: `npm run build`
5. Publish: `npm publish`

## Version Numbering Guidelines

- `patch` (1.0.0 → 1.0.1): Bug fixes and minor changes
- `minor` (1.0.0 → 1.1.0): New features, backward compatible
- `major` (1.0.0 → 2.0.0): Breaking changes

Use npm version to update:
```bash
npm version patch -m "Fix bug in X"
npm version minor -m "Add new feature Y"
npm version major -m "Breaking change to API"
``` 