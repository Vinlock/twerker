/**
 * Twerker - TypeScript Worker Threads Made Simple
 * 
 * A lightweight library for running TypeScript functions in worker threads
 * with type safety and a simple API.
 * 
 * Powered by poolifier (https://github.com/poolifier/poolifier)
 */

import { Worker as NodeWorker } from 'node:worker_threads';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as module from 'module';

// Use OS's CPU count instead of Poolifier's availableParallelism
const availableParallelism = () => os.cpus().length;

// Type definitions
type AnyFunction = (...args: any[]) => any;
type WorkerFunctionType<T extends AnyFunction> = T;

// Options for creating a worker pool
export interface PoolOptions {
  numWorkers?: number;
  maxQueueSize?: number;
  isDynamic?: boolean;
  minWorkers?: number;
}

// Options for creating a worker function
export interface TwerkerOptions {
  resourceLimits?: {
    maxYoungGenerationSizeMb?: number;
    maxOldGenerationSizeMb?: number;
    codeRangeSizeMb?: number;
    stackSizeMb?: number;
  };
  transferList?: ArrayBuffer[];
  workerCode?: string;
}

// Type definitions for global garbage collection
declare global {
  var gc: (() => void) | undefined;
}

/**
 * Worker object returned by the run function
 */
export interface Worker<T extends AnyFunction> {
  execute: (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
  createPool: (options?: PoolOptions) => WorkerPool<T>;
  /**
   * Unref the worker from the Node.js event loop
   * This allows the program to exit naturally when the main thread is done
   */
  unref: () => Worker<T>;
}

// Function to create a worker file
function createWorkerFile(serializedFn: string, options: TwerkerOptions = {}): string {
  // Create a temporary worker file
  const workerId = uuidv4();
  const workerFilePath = path.join(os.tmpdir(), `twerker-worker-${workerId}.js`);

  // Get current working directory - will be used to resolve modules
  const currentDir = process.cwd();

  // Include any custom worker code from options
  const customWorkerCode = options.workerCode || '';

  // Generate the worker code
  const workerCode = `
    const { Worker, parentPort, isMainThread } = require('worker_threads');
    const path = require('path');
    const fs = require('fs');
    
    // Make parentPort globally accessible for cleanup
    global.workerParentPort = parentPort;
    
    // Note: Workers can't use process.chdir(), but we can modify the module search paths
    module.paths.unshift(${JSON.stringify(currentDir)});
    module.paths.unshift(path.join(${JSON.stringify(currentDir)}, 'node_modules'));
    
    // Execute custom worker setup code
    ${customWorkerCode}
    
    // Set up clean exit handler
    process.on('exit', () => {
      cleanupWorker();
    });
    
    // Explicit cleanup function to ensure MessagePort is properly closed
    function cleanupWorker() {
      if (parentPort) {
        try {
          // Remove all listeners
          parentPort.removeAllListeners();
          
          // Send a final cleanup message
          try {
            parentPort.postMessage({ type: 'cleanup' });
          } catch (e) {
            // Ignore if port is already closed
          }
          
          // Close the port explicitly if possible
          if (typeof parentPort.close === 'function') {
            parentPort.close();
          }
          
          // Nullify the reference to help garbage collection
          // @ts-ignore - Intentionally modifying global to help GC
          global.parentPort = undefined;
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    }
    
    // Handle termination signal
    process.on('SIGTERM', () => {
      cleanupWorker();
      process.exit(0);
    });
    
    // Simple implementation of ThreadWorker that uses Node.js worker_threads directly
    class SimpleThreadWorker {
      constructor(fn) {
        this.fn = fn;
        
        if (parentPort) {
          // This is a worker thread
          parentPort.on('message', async (data) => {
            // Check if this is a termination message
            if (data && data.type === 'terminate') {
              cleanupWorker();
              process.exit(0);
              return;
            }
            
            try {
              // Execute the function with the provided arguments
              const result = await this.fn(data);
              parentPort.postMessage({ success: true, result });
            } catch (error) {
              parentPort.postMessage({ 
                success: false, 
                error: { 
                  message: error.message,
                  stack: error.stack
                } 
              });
            }
          });
          
          // Handle worker thread exit request
          parentPort.on('close', () => {
            // Clean up and exit
            cleanupWorker();
            process.exit(0);
          });
        }
      }
    }
    
    // The actual worker function
    const worker = (data) => {
      try {
        // Get function to execute from the serialized string
        const fn = Function('return ' + ${JSON.stringify(serializedFn)})();
        
        // Execute the function with the provided arguments
        return fn(...data);
      } catch (error) {
        console.error('Error executing worker function:', error);
        return Promise.reject(error);
      }
    };
    
    // Export worker
    module.exports = new SimpleThreadWorker(worker);
  `;

  // Write the worker file
  fs.writeFileSync(workerFilePath, workerCode);

  // Register cleanup
  process.on('exit', () => {
    try {
      fs.unlinkSync(workerFilePath);
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  return workerFilePath;
}

// Task status
type TaskStatus = 'pending' | 'executing' | 'completed' | 'failed';

// Task interface
interface Task<T> {
  id: string;
  args: any[];
  status: TaskStatus;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

/**
 * Worker pool for managing multiple worker threads
 */
export class WorkerPool<T extends AnyFunction> {
  private workers: NodeWorker[] = [];
  private taskQueue: Task<Awaited<ReturnType<T>>>[] = [];
  private workerAvailable: boolean[] = [];
  private workerPath: string;
  private isTerminating = false;

  constructor(
    serializedFunction: string,
    numWorkers: number = availableParallelism(),
    options: TwerkerOptions = {},
    isDynamic: boolean = false,
    minWorkers: number = 1
  ) {
    // Create worker file
    this.workerPath = createWorkerFile(serializedFunction, options);

    // If isDynamic is true, use minWorkers as initial count, otherwise use numWorkers
    const initialWorkerCount = isDynamic ? minWorkers : numWorkers;

    // Initialize workers
    for (let i = 0; i < initialWorkerCount; i++) {
      this.addWorker(options);
    }

    this.workerAvailable = new Array(this.workers.length).fill(true);
  }

  // Add a worker to the pool
  private addWorker(options: TwerkerOptions): void {
    const worker = new NodeWorker(this.workerPath, {
      resourceLimits: options.resourceLimits
    });

    // Handle worker messages
    worker.on('message', (message) => {
      const workerId = this.workers.indexOf(worker);

      // Process result
      if (message.success) {
        const task = this.taskQueue.find(t => t.status === 'executing');
        if (task) {
          task.status = 'completed';
          task.resolve(message.result);
        }
      } else {
        const task = this.taskQueue.find(t => t.status === 'executing');
        if (task) {
          task.status = 'failed';
          task.reject(new Error(message.error.message));
        }
      }

      // Mark worker as available
      this.workerAvailable[workerId] = true;

      // Process next task if available
      this.processNextTask();
    });

    // Handle worker errors
    worker.on('error', (error) => {
      const workerId = this.workers.indexOf(worker);
      console.error(`Worker ${workerId} error:`, error);

      // Mark worker as available
      this.workerAvailable[workerId] = true;

      // Find executing task and reject it
      const task = this.taskQueue.find(t => t.status === 'executing');
      if (task) {
        task.status = 'failed';
        task.reject(error);
      }

      // Process next task if available
      this.processNextTask();
    });

    this.workers.push(worker);
  }

  // Process the next task in the queue
  private processNextTask(): void {
    if (this.isTerminating) return;

    // Find the next pending task
    const nextTask = this.taskQueue.find(t => t.status === 'pending');
    if (!nextTask) return;

    // Find an available worker
    const availableWorkerIndex = this.workerAvailable.findIndex(available => available);
    if (availableWorkerIndex === -1) return;

    // Mark worker as busy
    this.workerAvailable[availableWorkerIndex] = false;

    // Update task status
    nextTask.status = 'executing';

    // Send the task to the worker
    this.workers[availableWorkerIndex].postMessage(nextTask.args);
  }

  /**
   * Queue a task to be processed by an available worker
   */
  queue(...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    return new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
      // Create a new task
      const task: Task<Awaited<ReturnType<T>>> = {
        id: uuidv4(),
        args,
        status: 'pending',
        resolve,
        reject
      };

      // Add task to queue
      this.taskQueue.push(task);

      // Try to process the task
      this.processNextTask();
    });
  }

  /**
   * Wait for all queued and running tasks to complete
   */
  async waitForAllTasks(): Promise<void> {
    // If no tasks in queue, return immediately
    if (this.taskQueue.length === 0) return;

    // Wait for all tasks to complete
    return new Promise<void>((resolve) => {
      let checkInterval: NodeJS.Timeout | null = null;

      // Create a safe cleanup function
      const cleanup = () => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      };

      // Set up interval checking
      checkInterval = setInterval(() => {
        // Check if any tasks are still pending or executing
        const pendingOrExecuting = this.taskQueue.some(
          task => task.status === 'pending' || task.status === 'executing'
        );

        // If no tasks are pending or executing, resolve the promise
        if (!pendingOrExecuting) {
          cleanup();

          // Clean up completed tasks
          this.taskQueue = this.taskQueue.filter(
            task => task.status === 'pending' || task.status === 'executing'
          );

          // Debug only: Check what's keeping the process alive
          const debugTimer = setTimeout(() => {
            console.log('Process is still alive after 1 second');
            try {
              // These are internal methods that might not be available in all Node.js versions
              // @ts-ignore - intentionally using internal Node.js API for debugging
              const activeHandles = process._getActiveHandles?.() || [];
              // @ts-ignore - intentionally using internal Node.js API for debugging
              const activeRequests = process._getActiveRequests?.() || [];

              console.log(`Active handles count: ${activeHandles.length}`);
              console.log(`Active requests count: ${activeRequests.length}`);

              // Log types of active handles
              const handleTypes = activeHandles.map((h: any) => h.constructor.name);
              console.log('Handle types:', [...new Set(handleTypes)]);
            } catch (e: unknown) {
              console.log('Could not inspect active handles/requests:', (e as Error).message);
            }
          }, 1000);

          // Prevent the debug timer from keeping the process alive
          debugTimer.unref();

          resolve();
        }
      }, 50);

      // Ensure the check interval doesn't keep the process alive
      if (checkInterval.unref) {
        checkInterval.unref();
      }
    });
  }

  /**
   * Terminate all workers after all queued tasks are completed
   */
  async terminateWhenDone(): Promise<void> {
    try {
      await this.waitForAllTasks();
    } catch (err) {
      console.error('Error waiting for tasks to complete:', err);
    }

    try {
      await this.terminate();
    } catch (err) {
      console.error('Error terminating worker pool:', err);
    }

    // Set up an emergency exit fallback if the process is still hanging
    const emergencyExit = setTimeout(() => {
      console.warn('EMERGENCY EXIT: Process still alive after termination, forcing exit');
      process.exit(0);
    }, 3000);

    // Don't let the emergency exit timer prevent natural exit
    emergencyExit.unref();
  }

  /**
   * Terminate all workers immediately (cancels queued tasks)
   */
  async terminate(): Promise<void> {
    this.isTerminating = true;
    console.log('Terminating worker pool...');

    // Terminate all workers with proper error handling and port cleanup
    const terminationPromises = this.workers.map(async (worker, index) => {
      try {
        console.log(`Terminating worker ${index + 1}/${this.workers.length}...`);

        // First try to send a termination message to allow clean shutdown
        try {
          worker.postMessage({ type: 'terminate' });
        } catch (e) {
          // Ignore if already disconnected
        }

        // First remove all listeners to prevent memory leaks
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
        worker.removeAllListeners('online');

        // Force close any ports by explicitly closing standard streams
        if (worker.stdout) worker.stdout.destroy();
        if (worker.stderr) worker.stderr.destroy();
        if (worker.stdin) worker.stdin.end();

        // Add a timeout to force terminate if it takes too long
        const terminationPromise = worker.terminate();

        // Create a timeout promise
        const timeoutPromise = new Promise<void>((_, reject) => {
          const timeout = setTimeout(() => {
            clearTimeout(timeout);
            console.warn(`Worker ${index + 1} termination timed out, forcing exit`);
            reject(new Error('Worker termination timed out'));
          }, 1000);
          // Ensure the timeout doesn't keep the process alive
          timeout.unref();
        });

        // Race the termination against the timeout
        await Promise.race([terminationPromise, timeoutPromise]);
        console.log(`Worker ${index + 1} terminated successfully`);
      } catch (err) {
        console.error(`Error terminating worker ${index + 1}:`, err);
      }
    });

    try {
      await Promise.all(terminationPromises);
    } catch (err) {
      console.error('Error during worker termination:', err);
    }

    // Clear the workers array to remove references
    const workerCount = this.workers.length;
    this.workers = [];
    this.workerAvailable = [];

    // Reject all remaining tasks
    const pendingTaskCount = this.taskQueue.filter(
      task => task.status === 'pending' || task.status === 'executing'
    ).length;

    this.taskQueue
      .filter(task => task.status === 'pending' || task.status === 'executing')
      .forEach(task => {
        task.status = 'failed';
        task.reject(new Error('Worker pool terminated'));
      });

    // Clear the task queue to remove references
    const totalTaskCount = this.taskQueue.length;
    this.taskQueue = [];

    // Clean up the worker file
    try {
      fs.unlinkSync(this.workerPath);
    } catch (err) {
      // Ignore cleanup errors
    }

    // Force global cleanup through garbage collection (if possible)
    if (typeof global.gc === 'function') {
      try {
        global.gc();
      } catch (e) {
        // Ignore GC errors
      }
    }

    // Force disconnect any remaining MessagePort objects
    this.forceDisconnectMessagePorts();

    console.log(`Worker pool terminated: ${workerCount} workers closed, ${pendingTaskCount}/${totalTaskCount} pending tasks rejected`);
  }

  /**
   * Force disconnect any remaining MessagePort objects
   * This is a last resort to clear any hanging MessagePort handles
   */
  private forceDisconnectMessagePorts(): void {
    try {
      // @ts-ignore - Using internal Node.js API for cleanup
      const activeHandles = process._getActiveHandles?.() || [];

      let messagePortsFound = 0;

      // Find and close any MessagePort objects
      for (const handle of activeHandles) {
        try {
          if (handle && handle.constructor && handle.constructor.name === 'MessagePort') {
            messagePortsFound++;
            console.log('Found active MessagePort, forcing close...');

            // Try to remove all listeners
            if (typeof handle.removeAllListeners === 'function') {
              handle.removeAllListeners();
            }

            // Try to close the port
            if (typeof handle.close === 'function') {
              handle.close();
            }

            // Try to terminate if it's a worker
            if (typeof handle.terminate === 'function') {
              handle.terminate();
            }
          }
        } catch (e) {
          // Ignore errors during forced cleanup
        }
      }

      if (messagePortsFound > 0) {
        console.log(`Forced disconnection of ${messagePortsFound} MessagePort objects`);
      }
    } catch (e) {
      // Ignore errors during forced cleanup
    }
  }

  /**
   * Unref the worker pool from the Node.js event loop
   * This allows the program to exit naturally when the main code is done
   */
  unref(): this {
    // Unref all workers explicitly
    for (const worker of this.workers) {
      // Unref the worker itself
      worker.unref();

      // Also unref any streams - need to use type assertion as the types don't always include unref
      // @ts-ignore - Some Node.js stream types don't explicitly include unref in their type definitions
      if (worker.stdout && typeof worker.stdout.unref === 'function') worker.stdout.unref();
      // @ts-ignore - Some Node.js stream types don't explicitly include unref in their type definitions
      if (worker.stderr && typeof worker.stderr.unref === 'function') worker.stderr.unref();
      // @ts-ignore - Some Node.js stream types don't explicitly include unref in their type definitions
      if (worker.stdin && typeof worker.stdin.unref === 'function') worker.stdin.unref();
    }

    return this;
  }
}

/**
 * Helper function to serialize a function to a string
 */
function serializeFunction<T extends AnyFunction>(fn: T): string {
  // Check if the function is async
  const isAsync = fn.constructor.name === 'AsyncFunction';

  // Get the function's source code
  const fnString = fn.toString();

  // For async functions, ensure we preserve the async keyword
  if (isAsync && !fnString.startsWith('async')) {
    return `async ${fnString}`;
  }

  return fnString;
}

/**
 * Main function to create a worker from a TypeScript function
 */
export default function run<T extends AnyFunction>(
  workerFunction: WorkerFunctionType<T>,
  options: TwerkerOptions = {}
): Worker<T> {
  // Directly serialize the worker function
  const serializedFunction = serializeFunction(workerFunction);

  // Add additional code to the worker
  const moduleDir = process.cwd();
  const enhancedOptions = {
    ...options,
    workerCode: `
      // Enable imports relative to the main module directory
      // We can't use chdir in workers, so we modify the module paths directly
      if (require && require.main && require.main.paths) {
        require.main.paths.unshift(${JSON.stringify(moduleDir)});
        require.main.paths.unshift(require('path').join(${JSON.stringify(moduleDir)}, 'node_modules'));
      }
      
      ${options.workerCode || ''}
    `
  };

  // Create a worker pool with a single worker for direct execution
  const singleWorkerPool = new WorkerPool<T>(
    serializedFunction,
    1,
    enhancedOptions
  );

  // Create and return the worker object
  const worker: Worker<T> = {
    execute: (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      return singleWorkerPool.queue(...args);
    },
    createPool: (poolOptions: PoolOptions = {}): WorkerPool<T> => {
      const {
        numWorkers = availableParallelism(),
        isDynamic = false,
        minWorkers = 1
      } = poolOptions;

      return new WorkerPool<T>(
        serializedFunction,
        numWorkers,
        enhancedOptions,
        isDynamic,
        minWorkers
      );
    },
    unref: (): Worker<T> => {
      singleWorkerPool.unref();
      return worker;
    }
  };

  return worker;
} 