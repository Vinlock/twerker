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

## License

ISC

## Core Maintainer

Dak Washbrook ([@dakdevs on X](https://x.com/dakdevs))

---

Made with ❤️ using TypeScript and Node.js 