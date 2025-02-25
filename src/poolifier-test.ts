/**
 * Test file to verify the Poolifier implementation
 */
import run from './twerker';

function add(a: number, b: number): number {
  return a + b;
}

// A simple worker function with a delay
function delayedGreeting(name: string, delayMs: number): Promise<string> {
  add(1, 2);

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Hello, ${name}!`);
    }, delayMs);
  });
}

async function main() {
  console.log('Starting Poolifier test demo');

  // Create a worker
  const worker = run(delayedGreeting);

  // Create a worker pool with 4 workers
  const pool = worker.createPool({ numWorkers: 4 });

  console.log('Running tasks...');

  // Queue multiple tasks with different delays
  const results = await Promise.all([
    pool.queue('World', 1000),
    pool.queue('Node.js', 800),
    pool.queue('Twerker', 1200),
    pool.queue('Worker', 500)
  ]);

  // Print results
  results.forEach((result, i) => {
    console.log(`Result ${i + 1}: ${result}`);
  });

  // Terminate the pool when all tasks are done
  console.log('Waiting for all tasks to complete...');
  await pool.terminateWhenDone();

  console.log('All tasks completed, program should exit naturally');
}

main().catch(error => {
  console.error('Error:', error);
}); 