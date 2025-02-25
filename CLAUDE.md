# Twerker Development Guidelines

## Commands
- Build: `npm run build`
- Test: `npm test`
- Run single test: `npx jest path/to/test.ts`
- Lint: `npm run lint`
- Example: `npm run example:fibonacci`

## Code Style
- **Imports**: Group by type (node built-ins first, then external packages, then internal)
- **Types**: Use explicit types for function parameters/returns
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Error Handling**: Use try/catch with specific error types where possible
- **Comments**: JSDoc format for public API functions
- **Formatting**: 2 space indentation, semi-colons required
- **TypeScript**: Strict mode enabled, avoid any where possible
- **Workers**: Always terminate workers properly, use unref() when appropriate

## Architecture
- Core API is simple with just run() function
- Worker pools should be terminated with terminateWhenDone()
- Error handling should preserve stack traces across worker boundaries