# Twerker

<div align="center">
  <img src="https://github.com/user-attachments/assets/71c59a45-a20f-4562-a271-72190df50995" alt="Stick figures twerking">

  <sub>Image inspired by [trashh_dev's](https://x.com/trashh_dev) stream starting screen.</sub>
</div>

**TypeScript Worker Threads Made Simple**

A lightweight library for running TypeScript functions in worker threads with type safety and a simple API.

[![npm version](https://badge.fury.io/js/twerker.svg)](https://badge.fury.io/js/twerker)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/node/v/twerker)](https://nodejs.org)

## Why Twerker?

I created Twerker out of necessity. While there are several worker thread libraries available, none of them provided the perfect combination of simplicity, type-safety, and bare-minimum functionality that I was looking for. Most existing solutions were either over-engineered or lacked proper TypeScript support.

Twerker aims to do one thing and do it well: provide a straightforward, type-safe way to run CPU-intensive tasks in worker threads. No bells and whistles, no complex configurations - just a clean API that works out of the box.

## Features

- 🔒 **Type Safe**: Full TypeScript support with automatic type inference for worker functions
- 🚀 **Simple API**: Run any function in a worker thread with minimal setup
- 🧵 **Thread Pools**: Create worker pools for processing multiple tasks in parallel
- 🔄 **Asynchronous**: Promise-based API for seamless integration
- 🧩 **Preserves Context**: Your functions run with proper access to imports and dependencies
- 🌐 **Full Dependency Support**: Access sibling functions and imported modules in your worker threads
- 🏁 **Clean Exit**: Worker pools terminate properly when no longer needed

## Installation

```bash
npm install twerker
```

## Quick Start

```typescript
import run from 'twerker';

// Define a function to run in a worker thread
function expensiveCalculation(n: number): number {
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

async function main() {
  // Create a worker
  const worker = run(expensiveCalculation);
  
  // Execute the function in a worker thread
  const result = await worker.execute(1000000);
  console.log('Result:', result);
  
  // Create a worker pool with 4 workers
  const pool = worker.createPool({ numWorkers: 4 });
  
  // Queue multiple tasks
  const results = await Promise.all([
    pool.queue(1000000),
    pool.queue(2000000),
    pool.queue(3000000),
    pool.queue(4000000)
  ]);
  
  console.log('Results:', results);
  
  // Terminate the pool when done
  await pool.terminateWhenDone();
}

main().catch(console.error);
```

## Using Sibling Functions and Imported Modules

Twerker automatically handles sibling functions and imported modules in your worker threads. This means you can:

1. **Call sibling functions**: Use other functions defined in the same file as your worker function
2. **Use imported modules**: Access modules imported in your file
3. **Handle both NodeJS built-ins and local modules**: Works with the Node.js standard library and local project imports

Example with sibling functions and imports:

```typescript
import crypto from 'crypto';
import { subtract } from './subtract';

// Sibling function
function add(a: number, b: number): number {
  return a + b;
}

// Worker function that uses sibling functions and imports
async function processData(name: string, delayMs: number): Promise<string> {
  // Use the 'add' sibling function
  const sum = subtract(add(delayMs, 500), 2);

  // Use the imported crypto module
  const id = crypto.randomUUID().slice(0, 8);

  return `Hello, ${name} (ID: ${id}, processed in ${sum}ms)`;
}

// Use with Twerker - sibling functions and imports work automatically
const worker = run(processData);
const result = await worker.execute('World', 100);
```

### How It Works

Twerker analyzes your source code and:
1. Detects imported modules and makes them available in the worker context
2. Captures sibling functions and includes them in the worker thread
3. Handles special cases like `this` binding for methods on imported modules
4. Ensures proper cleanup after execution

## API Reference

### `run<T>(workerFunction: T, options?: TwerkerOptions): Worker<T>`

Creates a worker from a TypeScript function.

```typescript
const worker = run(myFunction, { 
  resourceLimits: { maxOldGenerationSizeMb: 256 }
});
```

### Worker

The `Worker` object returned by the `run` function.

- `execute(...args)`: Execute the worker function with the provided arguments
- `createPool(options)`: Create a worker pool for processing multiple tasks
- `unref()`: Unref the worker from the Node.js event loop (allows program to exit naturally)

### WorkerPool

A pool of workers for processing multiple tasks in parallel.

- `queue(...args)`: Queue a task to be processed by an available worker
- `waitForAllTasks()`: Wait for all queued and running tasks to complete
- `terminateWhenDone()`: Terminate all workers after all tasks are completed
- `terminate()`: Terminate all workers immediately (cancels pending tasks)
- `unref()`: Unref the worker pool from the Node.js event loop

## Memory and Resource Management

When working with worker threads, it's important to properly manage resources:

1. Always call `terminateWhenDone()` when you're done with a worker pool
2. Use `unref()` when you want the program to exit naturally even if workers are still running
3. Set resource limits if needed using the `resourceLimits` option

## Limitations

While Twerker attempts to support sibling functions and module imports, there are some limitations:

1. Complex dependencies may not be fully serialized
2. Some modules with special requirements might need manual handling
3. Functions that rely on closure variables might not work as expected
4. Modules with 'this' binding issues (like some crypto methods) receive special handling

## License

ISC

## Core Maintainer

Dak Washbrook ([@dakdevs on X](https://x.com/dakdevs))

---

Made with ❤️ using TypeScript and Node.js 