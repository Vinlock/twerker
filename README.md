# Twerker

A powerful and type-safe TypeScript worker thread pool implementation for Node.js with zero dependencies.

[![npm version](https://badge.fury.io/js/twerker.svg)](https://badge.fury.io/js/twerker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/twerker)](https://nodejs.org)

## Features

- 📦 Zero dependencies - uses only Node.js built-in modules
- 🚀 Simple and intuitive API for managing worker threads
- 💪 Fully type-safe with TypeScript
- 🔄 Automatic thread pool management
- 📊 Dynamic task queuing and distribution
- 🎯 Console output forwarding from workers
- ⚡ Built for performance with minimal overhead
- 🛡️ Robust error handling

## Installation

```bash
pnpm add -D typescript @types/node
pnpm add twerker
```

## Quick Start

Create two separate files: one for defining your worker and another for using it. Name your worker file using kebab-case to match the function it implements.

> [!WARNING]
> Always use `createPool()` for running multiple tasks. Do not use `Promise.all()` with multiple `.run()` calls, as this will create a new worker thread for each task, which is inefficient and can overwhelm your system.

### `heavy-computation.ts` - Define your worker
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

// Export the runner directly
export default run(heavyComputation);
```

### `main.ts` - Use the worker
```typescript
import worker from './heavy-computation';

async function main() {
  // Method 1: Run a single task
  const result = await worker.run(10, 20);
  console.log('Single task result:', result);

  // Method 2: Create a pool for multiple tasks
  const pool = worker.createPool(); // Uses number of CPU cores by default
  
  // Queue tasks as needed
  const result1 = await pool.queue(10, 20);
  const result2 = await pool.queue(30, 40);
  const result3 = await pool.queue(50, 60);
  
  console.log('Pool results:', [result1, result2, result3]);

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

## Core Maintainer

Dak Washbrook ([@dakdevs on X](https://x.com/dakdevs))

---

Made with ❤️ using TypeScript and Node.js