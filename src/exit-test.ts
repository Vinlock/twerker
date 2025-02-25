/**
 * Test file to verify that the program exits cleanly when workers are unreferenced
 */
import run from './twerker';

// A simple worker function that takes a while to complete
function longRunningTask(delayMs: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Task completed after ${delayMs}ms`);
    }, delayMs);
  });
}

async function main() {
  console.log('Starting exit test demo');

  // Create a worker and unref it
  const worker = run(longRunningTask).unref();

  // Create some long-running tasks
  worker.execute(5000).then(result => {
    console.log('Task result (should not be seen):', result);
  }).catch(err => {
    console.error('Task error:', err);
  });

  // The program should exit cleanly even though the task is still running
  console.log('Main thread work is complete');
  console.log('The program should exit now, even with pending worker tasks');
}

main().catch(error => {
  console.error('Error:', error);
}); 