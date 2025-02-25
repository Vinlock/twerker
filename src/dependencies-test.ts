/**
 * Test file to verify the Twerker implementation with both sibling functions
 * and imported dependencies
 */
import run from './twerker';
import crypto from 'crypto';

// Sibling function 1: Basic addition
function add(a: number, b: number): number {
  return a + b;
}

// Sibling function 2: Format a string
function formatMessage(prefix: string, name: string): string {
  return `${prefix} ${name}`;
}

// Sibling function 3: Generate ID without 'this' binding issues
const generateId = () => {
  // Use the full module path to avoid 'this' binding issues
  return crypto.randomUUID().slice(0, 8);
};

// Worker function that uses both sibling functions and an imported dependency
async function processData(name: string, delayMs: number): Promise<string> {
  // Use the 'add' sibling function
  const sum = add(delayMs, 500);

  // Use the 'generateId' sibling function which uses crypto
  const id = generateId();

  // Use the 'formatMessage' sibling function
  const message = formatMessage("Hello,", name);

  // Return a formatted result with all the pieces
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`${message} (ID: ${id}, processed in ${sum}ms)`);
    }, delayMs);
  });
}

async function main() {
  console.log('Starting Dependencies Test');

  // Create a worker pool with 2 workers
  const worker = run(processData);
  const pool = worker.createPool({ numWorkers: 2 });

  console.log('Running tasks...');

  // Queue multiple tasks with different delays
  const results = await Promise.all([
    pool.queue('World', 100),
    pool.queue('Twerker', 200)
  ]);

  // Print results
  results.forEach((result, i) => {
    console.log(`Result ${i + 1}: ${result}`);
  });

  // Terminate the pool
  await pool.terminateWhenDone();

  console.log('All tasks completed');
}

main().catch(error => {
  console.error('Error:', error);
}); 