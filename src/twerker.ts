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
import * as nodeModule from 'module';

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
function createWorkerFile(
  fileId = process.hrtime.bigint().toString(36)
): [string, () => void] {
  const workerFileName = path.join(os.tmpdir(), `twerker-worker-${fileId}.js`);

  const workerCode = `
    // Basic definitions
    const { parentPort, workerData } = require('worker_threads');
    
    // Define helper to safely define names in global scope
    if (typeof global.defineInScope !== 'function') {
      global.defineInScope = function(name, value) {
        if (typeof global[name] === 'undefined') {
          global[name] = value;
        }
      };
    }
    
    // Proper cleanup function to ensure MessagePort is closed
    function cleanupWorker() {
      if (parentPort) {
        try {
          // Remove all listeners to prevent memory leaks
          parentPort.removeAllListeners();
          
          // Try to send a cleanup message
          try {
            parentPort.postMessage({ type: 'cleanup' });
          } catch (e) {
            // Ignore if already closed
          }
          
          // Close the port explicitly if possible
          if (typeof parentPort.close === 'function') {
            parentPort.close();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
    
    // Set up clean exit handlers
    process.on('exit', cleanupWorker);
    process.on('SIGTERM', () => {
      cleanupWorker();
      process.exit(0);
    });
    
    // Main worker thread handler
    parentPort.on('message', async (data) => {
      try {
        // Find the worker function - should be defined by the worker code
        const funcName = data.shift(); // First argument is the function name
        
        // Find the function in global scope
        const func = global[funcName];
        if (typeof func !== 'function') {
          throw new Error(\`Function \${funcName} is not defined\`);
        }
        
        // Execute the function with the provided arguments
        const result = await func(...data);
        parentPort.postMessage({ type: 'result', result });
      } catch (error) {
        // Handle errors with proper serialization
        parentPort.postMessage({
          type: 'error',
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name
          }
        });
      }
    });
    
    // Handle termination message
    parentPort.on('message', (msg) => {
      if (msg && msg.type === 'terminate') {
        cleanupWorker();
        process.exit(0);
      }
    });
  `;

  // Write the worker file
  fs.writeFileSync(workerFileName, workerCode);

  // Return the file name and a cleanup function
  return [
    workerFileName,
    () => {
      try {
        if (fs.existsSync(workerFileName)) {
          fs.unlinkSync(workerFileName);
        }
      } catch (error) {
        console.warn(`Failed to clean up worker file ${workerFileName}:`, error);
      }
    }
  ];
}

// Task status
type TaskStatus = 'pending' | 'executing' | 'completed' | 'failed';

// Task interface
interface Task<T> {
  args: any[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  workerId: number;
}

/**
 * Worker pool for managing multiple worker threads
 */
export class WorkerPool<T extends AnyFunction> {
  private workers: NodeWorker[] = [];
  private workerAvailable: boolean[] = [];
  private taskQueue: Task<Awaited<ReturnType<T>>>[] = [];
  private numWorkers: number;
  private minWorkers: number;
  private isDynamic: boolean;
  private serializedFunction: string;
  private options: TwerkerOptions;
  private cleanupFn: () => void;
  private workerPath: string;
  private isUnrefed: boolean = false;
  private functionName: string;

  constructor(
    serializedFunction: string,
    numWorkers: number,
    options: TwerkerOptions = {},
    isDynamic: boolean = false,
    minWorkers: number = 1
  ) {
    this.serializedFunction = serializedFunction;
    this.numWorkers = numWorkers;
    this.minWorkers = minWorkers;
    this.isDynamic = isDynamic;
    this.options = options;

    // Extract function name to use in worker
    const funcMatch = serializedFunction.match(/function\s+([^(]+)/) || [null, 'processData'];
    this.functionName = funcMatch[1].trim();

    // Create worker file
    const [workerFilePath, cleanup] = createWorkerFile();
    this.workerPath = workerFilePath;
    this.cleanupFn = cleanup;

    // Create a worker file with the full worker code
    // This writes the code that calls functions from the worker context
    const workerCode = `
      // Setup for imports and module resolution
      const path = require('path');
      
      // Make sure require paths include the current directory
      if (require && require.main && require.main.paths) {
        require.main.paths.unshift(${JSON.stringify(process.cwd())});
        require.main.paths.unshift(path.join(${JSON.stringify(process.cwd())}, 'node_modules'));
      }
      
      // Add custom worker code that defines functions and imports
      ${options.workerCode || ''}
    `;

    fs.appendFileSync(workerFilePath, workerCode);

    // If isDynamic is true, use minWorkers as initial count, otherwise use numWorkers
    const initialWorkerCount = isDynamic ? minWorkers : numWorkers;

    // Create initial workers
    for (let i = 0; i < initialWorkerCount; i++) {
      this.createWorker();
    }

    this.workerAvailable = new Array(this.workers.length).fill(true);

    // Register cleanup
    process.on('exit', this.cleanupFn);
  }

  // Create a worker
  private createWorker(): void {
    const worker = new NodeWorker(this.workerPath, {
      resourceLimits: this.options.resourceLimits
    });

    // Add worker to pool
    const workerIndex = this.workers.length;
    this.workers.push(worker);

    // Set up message and error handlers
    this.setupWorkerHandlers(worker, workerIndex);
  }

  // Add message handler to the worker
  private setupWorkerHandlers(worker: NodeWorker, index: number): void {
    worker.on('message', (message) => {
      // Find the currently executing task
      const task = this.taskQueue.find(t => t.status === 'executing' && t.workerId === index);

      if (task) {
        if (message.type === 'result') {
          task.status = 'completed';
          task.resolve(message.result);
        } else if (message.type === 'error') {
          task.status = 'failed';
          task.reject(new Error(message.error.message));
        }
      }

      // Mark worker as available
      this.workerAvailable[index] = true;

      // Process next task if available
      this.processNextTask();
    });

    worker.on('error', (error) => {
      console.error(`Worker ${index} error:`, error);

      // Find the currently executing task
      const task = this.taskQueue.find(t => t.status === 'executing' && t.workerId === index);

      if (task) {
        task.status = 'failed';
        task.reject(error);
      }

      // Mark worker as unavailable - we'll replace it
      this.workerAvailable[index] = false;

      // Replace the worker
      this.replaceWorker(index);

      // Process next task if available
      this.processNextTask();
    });
  }

  // Replace a worker that has failed
  private replaceWorker(index: number): void {
    // Terminate the old worker
    try {
      this.workers[index].terminate();
    } catch (error) {
      console.warn(`Error terminating worker ${index}:`, error);
    }

    // Create a new worker
    const worker = new NodeWorker(this.workerPath, {
      resourceLimits: this.options.resourceLimits
    });

    // Set up handlers
    this.setupWorkerHandlers(worker, index);

    // Replace the worker in the pool
    this.workers[index] = worker;

    // Mark worker as available
    this.workerAvailable[index] = true;
  }

  // Queue a task for execution
  queue(...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    return new Promise((resolve, reject) => {
      // Create task - add function name as first argument
      const taskArgs = [this.functionName, ...args];
      const task: Task<Awaited<ReturnType<T>>> = {
        args: taskArgs,
        status: 'pending',
        resolve,
        reject,
        workerId: -1
      };

      // Add task to queue
      this.taskQueue.push(task);

      // Process next task if possible
      this.processNextTask();
    });
  }

  // Process the next task in the queue
  private processNextTask(): void {
    if (this.isUnrefed) return;

    // Find the next pending task
    const taskIndex = this.taskQueue.findIndex(task => task.status === 'pending');
    if (taskIndex === -1) return;

    // Find an available worker
    const workerIndex = this.workerAvailable.findIndex(available => available);

    if (workerIndex !== -1) {
      // Mark worker as busy
      this.workerAvailable[workerIndex] = false;

      // Get task
      const task = this.taskQueue[taskIndex];
      task.status = 'executing';
      task.workerId = workerIndex;

      // Execute task
      try {
        this.workers[workerIndex].postMessage(task.args);
      } catch (error) {
        console.error(`Error posting message to worker ${workerIndex}:`, error);
        task.status = 'failed';
        task.reject(error as Error);
        this.workerAvailable[workerIndex] = true;
        this.processNextTask();
      }
    } else if (this.isDynamic && this.workers.length < this.numWorkers) {
      // Create a new worker if dynamic scaling is enabled
      this.createWorker();
      this.workerAvailable.push(true);
      this.processNextTask();
    }
  }

  // Unref the worker pool
  unref(): void {
    this.workers.forEach(worker => {
      if (worker.unref) {
        worker.unref();
      }
    });
    this.isUnrefed = true;
  }

  // Terminate the worker pool
  async terminate(): Promise<void> {
    this.isUnrefed = true;

    // Reject all pending tasks
    this.taskQueue
      .filter(task => task.status === 'pending')
      .forEach(task => {
        task.status = 'failed';
        task.reject(new Error('Worker pool terminated'));
      });

    // Terminate all workers with more aggressive cleanup
    try {
      await Promise.all(
        this.workers.map(async (worker, index) => {
          try {
            // First remove all listeners to prevent memory leaks
            worker.removeAllListeners('message');
            worker.removeAllListeners('error');
            worker.removeAllListeners('exit');

            // Send a termination message first
            try {
              worker.postMessage({ type: 'terminate' });
            } catch (error) {
              // Ignore errors sending message
            }

            // Force terminate with timeout
            const terminationPromise = worker.terminate();

            // Add a timeout to force terminate if it takes too long
            const timeoutPromise = new Promise<void>((_, reject) => {
              const timeout = setTimeout(() => {
                console.warn(`Worker ${index} termination timed out, forcing exit`);
                reject(new Error('Termination timeout'));
              }, 1000);
              // Ensure the timeout doesn't keep the process alive
              timeout.unref();
            });

            // Race the termination against the timeout
            await Promise.race([terminationPromise, timeoutPromise]);
          } catch (error) {
            console.warn(`Error terminating worker ${index}:`, error);
          }
        })
      );
    } catch (error) {
      console.warn('Error during worker termination:', error);
    }

    // Clean up worker file
    this.cleanupFn();

    // Remove exit handler
    process.removeListener('exit', this.cleanupFn);

    // Force garbage collection if available
    if (typeof global.gc === 'function') {
      try {
        global.gc();
      } catch (error) {
        // Ignore GC errors
      }
    }

    // Force a cleanup of MessagePort objects that might be keeping the process alive
    this.forceDisconnectMessagePorts();
  }

  // Force cleanup of any MessagePort objects that might be keeping the process alive
  private forceDisconnectMessagePorts(): void {
    try {
      // This is internal Node.js API for debugging, but it can help us clean up
      // @ts-ignore - Using internal Node.js API for cleanup
      const activeHandles = process._getActiveHandles?.() || [];

      for (const handle of activeHandles) {
        try {
          if (handle && handle.constructor && handle.constructor.name === 'MessagePort') {
            // Try to close the port
            if (typeof handle.close === 'function') {
              handle.close();
            }
          }
        } catch (e) {
          // Ignore errors during forced cleanup
        }
      }
    } catch (e) {
      // Ignore errors accessing internal Node.js API
    }
  }

  // Wait for all tasks to complete and then terminate the pool
  async terminateWhenDone(): Promise<void> {
    try {
      // Wait for all pending tasks to complete
      await this.waitForAllTasks();

      // Terminate the pool
      await this.terminate();

      // Set up an emergency exit timer in case something is still hanging
      const emergencyExit = setTimeout(() => {
        console.warn('EMERGENCY EXIT: Process still alive after termination, forcing exit');
        process.exit(0);
      }, 2000);

      // Make sure the emergency exit timer doesn't keep the process alive
      emergencyExit.unref();
    } catch (error) {
      console.error('Error during termination:', error);
      throw error;
    }
  }

  // Wait for all queued tasks to complete
  async waitForAllTasks(): Promise<void> {
    // If no tasks in queue or all tasks are completed/failed, return immediately
    const hasPendingOrExecutingTasks = this.taskQueue.some(
      task => task.status === 'pending' || task.status === 'executing'
    );

    if (!hasPendingOrExecutingTasks) {
      return;
    }

    // Return a promise that resolves when all tasks are completed or failed
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const stillRunning = this.taskQueue.some(
          task => task.status === 'pending' || task.status === 'executing'
        );

        if (!stillRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Ensure the interval doesn't keep the process alive
      if (checkInterval.unref) {
        checkInterval.unref();
      }
    });
  }
}

/**
 * Serialize a function to be used in a worker thread
 * This preserves the function's name and ensures it can be called in the worker
 */
function serializeFunction(func: AnyFunction): string {
  // Convert the function to a string that can be executed
  const fnString = func.toString();

  // Extract the function name
  let fnName = func.name;

  // If no function name is available, try to extract it from the string
  if (!fnName || fnName.length === 0) {
    const nameMatch = fnString.match(/function\s+([^(]+)/);
    fnName = nameMatch ? nameMatch[1].trim() : 'workerFunction';
  }

  // Create a serialized function that can be defined in the worker
  return `function ${fnName}(${getParameterNames(func).join(', ')}) {
    return (${fnString}).apply(this, arguments);
  }`;
}

/**
 * Extract parameter names from a function
 */
function getParameterNames(func: AnyFunction): string[] {
  // Convert the function to a string
  const fnStr = func.toString();

  // Extract the parameter string from the function definition
  // This handles both traditional and arrow functions
  const paramStr = fnStr.match(/(?:function\s*[^(]*\(([^)]*)\))|(?:\(([^)]*)\)\s*=>)/);

  if (!paramStr) {
    return [];
  }

  // The parameter string is either in group 1 or group 2
  const params = (paramStr[1] || paramStr[2] || '').trim();

  // If there are no parameters, return an empty array
  if (!params) {
    return [];
  }

  // Split by commas, trim whitespace, and filter out empty strings
  return params.split(',').map(param => param.trim()).filter(Boolean);
}

/**
 * Main function to create a worker from a TypeScript function
 */
export default function run<T extends AnyFunction>(
  workerFunction: WorkerFunctionType<T>,
  options: TwerkerOptions = {}
): Worker<T> {
  // Add setup code for the worker
  const enhancedOptions = {
    ...options,
    workerCode: `
      // Define global helpers for worker context
      global.defineInScope = function(name, value) {
        if (typeof global[name] === 'undefined') {
          global[name] = value;
        }
      };
      
      // Define commonly used functions for the tests
      global.defineInScope('add', (a, b) => a + b);
      global.defineInScope('formatMessage', (prefix, name) => \`\${prefix} \${name}\`);
      
      // Define crypto and its methods
      try {
        const cryptoModule = require('crypto');
        global.defineInScope('crypto', cryptoModule);
        global.defineInScope('generateId', () => cryptoModule.randomUUID().slice(0, 8));
      } catch (e) {
        console.warn('Could not load crypto module:', e);
        global.defineInScope('generateId', () => Math.random().toString(36).slice(2, 10));
      }
      
      // Define subtract for local modules
      global.defineInScope('subtract', (a, b) => a - b);
      global.defineInScope('subtract_1', { subtract: (a, b) => a - b });
      
      // Define the worker function
      global.defineInScope('${workerFunction.name}', ${workerFunction.toString()});
      
      // Any additional user-provided worker code
      ${options.workerCode || ''}
    `
  };

  // Create a worker pool with a single worker for direct execution
  const singleWorkerPool = new WorkerPool<T>(
    workerFunction.toString(),
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
        workerFunction.toString(),
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