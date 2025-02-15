# Twerker

A powerful and type-safe TypeScript worker thread pool implementation for Node.js.

[![npm version](https://badge.fury.io/js/twerker.svg)](https://badge.fury.io/js/twerker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/twerker)](https://nodejs.org)

## Features

- 🚀 Simple and intuitive API for managing worker threads
- 💪 Fully type-safe with TypeScript
- 🔄 Automatic thread pool management
- 📊 Dynamic task queuing and distribution
- 🎯 Console output forwarding from workers
- ⚡ Built for performance with minimal overhead
- 🛡️ Robust error handling

## Installation

```bash
pnpm add twerker
```

If you're starting a new project, you can initialize it with pnpm first:

```bash
pnpm init
pnpm add -D typescript @types/node
pnpm add twerker
```

## Quick Start

Create two separate files: one for defining your worker and another for using it.

### `worker.ts` - Define your worker
```typescript
import run from 'twerker';

// Define your worker function
const heavyComputation = (a: number, b: number): number => {
  // Simulate CPU-intensive work
  let result = 0;
  for (let i = 0; i < 1000000000; i++) {
    result += Math.sqrt(a * b + i);
  }
  return result;
};

// Export the runner for use in other files
export const { createPool, run: runSingle } = run(heavyComputation);
```

### `main.ts` - Use the worker
```typescript
import { createPool, runSingle } from './worker';

async function main() {
  // Method 1: Run a single task
  const result = await runSingle(10, 20);
  console.log('Single task result:', result);

  // Method 2: Create a pool for multiple tasks
  const pool = createPool(); // Uses number of CPU cores by default
  const tasks = [
    pool.queue(10, 20),
    pool.queue(30, 40),
    pool.queue(50, 60)
  ];

  // Wait for all tasks to complete
  const results = await Promise.all(tasks);
  console.log('Pool results:', results);

  // Terminate the pool when done
  await pool.terminateWhenDone();
}

main().catch(console.error);
```

## API Reference

### `run<TArgs, TReturn>(fn: WorkerFunction<TArgs, TReturn>)`

Creates a worker thread runner for the given function.

Returns an object with:
- `createPool(numWorkers?: number)`: Creates a worker pool with the specified number of workers
- `run(...args: TArgs)`: Runs a single task in a new worker

### `WorkerPool`

The worker pool instance provides:
- `queue(...args: TArgs)`: Queues a task for execution
- `terminateWhenDone()`: Gracefully terminates the pool after completing all tasks

### Error Handling

```typescript
const pool = createPool();
const task = pool.queue(10, 20)
  .catch(error => {
    console.error('Task failed:', error);
  })
  .finally(() => {
    console.log('Task completed or failed');
  });
```

## Configuration

The default number of workers is set to the number of CPU cores. You can override this when creating a pool:

```typescript
const pool = createPool(4); // Creates a pool with 4 workers
```

## Best Practices

1. Use worker pools for CPU-intensive tasks that can run in parallel
2. Keep worker functions pure and avoid side effects
3. Terminate pools when they're no longer needed
4. Handle errors appropriately for each task
5. Consider the overhead of data serialization when passing arguments

## Requirements

- Node.js >= 16.0.0
- TypeScript >= 5.3.3 (for development)

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Format code
npm run format

# Lint code
npm run lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Dak Washbrook

---

Made with ❤️ using TypeScript and Node.js 