/**
 * Simple Example - Twerker
 * 
 * This example demonstrates the basic usage of Twerker to run a function
 * in a worker thread and create a worker pool.
 */
import run from '../src';

// A simple CPU-intensive function
function fibonacciCalculator(n: number): number {
  if (n <= 1) return n;
  return fibonacciCalculator(n - 1) + fibonacciCalculator(n - 2);
}

async function main() {
  console.time('Total execution');
  console.log('Starting Twerker simple example...');

  // Create a worker
  const worker = run(fibonacciCalculator);

  // Execute a single task
  console.time('Single task');
  const result = await worker.execute(40);
  console.timeEnd('Single task');
  console.log(`Fibonacci(40) = ${result}`);

  // Create a worker pool with 4 workers
  console.log('\nCreating a worker pool with 4 workers...');
  const pool = worker.createPool({ numWorkers: 4 });

  // Queue multiple tasks
  console.time('Multiple tasks');
  const values = [38, 39, 40, 41];
  const results = await Promise.all(
    values.map(n => pool.queue(n))
  );
  console.timeEnd('Multiple tasks');

  // Print results
  results.forEach((result, i) => {
    console.log(`Fibonacci(${values[i]}) = ${result}`);
  });

  // Terminate the pool
  console.log('\nTerminating the worker pool...');
  await pool.terminateWhenDone();

  console.timeEnd('Total execution');
  console.log('Example completed successfully!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 