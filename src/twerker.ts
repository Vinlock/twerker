import type { WorkerOptions } from 'node:worker_threads'
import {
	Worker,
	isMainThread,
	parentPort,
} from 'node:worker_threads'
import { cpus } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Types
type ConsoleMethod = keyof Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>
type ConsoleArgs = unknown[]

type ConsoleMessage = {
	readonly __consoleLog: true
	readonly method: ConsoleMethod
	readonly args: ConsoleArgs
}

type WorkerErrorMessage = {
	readonly error: string
}

type WorkerSuccessMessage<T> = {
	readonly result: T
}

type WorkerMessage<T> =
	| ConsoleMessage
	| WorkerErrorMessage
	| WorkerSuccessMessage<T>

type Task<TArgs extends readonly unknown[], TReturn> = {
	readonly args: TArgs
	readonly resolve: (value: TReturn) => void
	readonly reject: (error: Error) => void
}

type PoolState<TArgs extends readonly unknown[], TReturn> = {
	readonly workers: readonly Worker[]
	readonly busyWorkers: ReadonlySet<Worker>
	readonly taskQueue: readonly Task<TArgs, TReturn>[]
	readonly completedTasks: number
	readonly totalTasks: number
}

type WorkerFunction<TArgs extends readonly unknown[], TReturn> =
	(...args: TArgs) => TReturn | Promise<TReturn>

type PoolOptions = {
	readonly numCPUs?: number
	readonly handleError?: (error: Error) => void | Promise<void>
}

type QueueResult<TReturn> = {
	readonly then: <TResult1 = TReturn, TResult2 = never>(
		onfulfilled?: ((value: TReturn) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	) => Promise<TResult1 | TResult2>
	readonly catch: <TResult = never>(
		onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
	) => Promise<TReturn | TResult>
	readonly finally: (onfinally?: (() => void) | null) => Promise<TReturn>
	readonly handleError: (handler: (error: Error) => void | Promise<void>) => Promise<TReturn | undefined>
}

type WorkerPool<TArgs extends readonly unknown[], TReturn> = {
	readonly queue: (...args: TArgs) => QueueResult<TReturn>
	readonly terminateWhenDone: () => Promise<void>
}

type WorkerConfig = {
	readonly workerPath: string
	readonly nodePath: string
}

type RunResult<TArgs extends readonly unknown[], TReturn> = {
	readonly createPool: (options?: PoolOptions) => WorkerPool<TArgs, TReturn>
	readonly run: (...args: TArgs) => Promise<TReturn>
}

// Constants
const CONSOLE_METHODS: readonly ConsoleMethod[] = [
	'log',
	'info',
	'warn',
	'error',
	'debug',
] as const

// Type Guards
const isConsoleMessage = (msg: unknown): msg is ConsoleMessage => {
	return typeof msg === 'object' &&
		msg !== null &&
		'__consoleLog' in msg &&
		'method' in msg &&
		'args' in msg
}

const isWorkerErrorMessage = (msg: unknown): msg is WorkerErrorMessage => {
	return typeof msg === 'object' &&
		msg !== null &&
		'error' in msg &&
		typeof msg.error === 'string'
}

const isWorkerSuccessMessage = <T>(msg: unknown): msg is WorkerSuccessMessage<T> => {
	return typeof msg === 'object' &&
		msg !== null &&
		'result' in msg
}

const getWorkerPath = (): WorkerConfig => {
	const currentFilePath = fileURLToPath(import.meta.url)
	const currentDir = path.dirname(currentFilePath)
	const workerPath = currentFilePath

	return {
		workerPath,
		nodePath: currentDir,
	}
}

const createWorkerOptions = (nodePath: string): WorkerOptions => {
	return {
		execArgv: [
			'--no-warnings',
			...process.execArgv,
		],
		env: {
			...process.env,
			NODE_PATH: nodePath,
		},
	}
}

const createWorker = () => {
	const config = getWorkerPath()

	return new Worker(config.workerPath, createWorkerOptions(config.nodePath))
}

// Worker pool
const createWorkerPool = <TArgs extends readonly unknown[], TReturn>(
	fn: WorkerFunction<TArgs, TReturn>,
	options: PoolOptions = {},
): WorkerPool<TArgs, TReturn> => {
	const numWorkers = options.numCPUs ?? cpus().length
	const globalErrorHandler = options.handleError
	let state: PoolState<TArgs, TReturn> | null = null
	let isTerminating = false
	let terminateResolve: (() => void) | null = null

	const createInitialState = (): PoolState<TArgs, TReturn> => {
		return {
			workers: Array.from({
				length: numWorkers,
			}, createWorker),
			busyWorkers: new Set(),
			taskQueue: [],
			completedTasks: 0,
			totalTasks: 0,
		}
	}

	const checkAndTerminate = (currentState: PoolState<TArgs, TReturn>) => {
		if (isTerminating && currentState.completedTasks === currentState.totalTasks && terminateResolve) {
			terminateResolve()
		}
	}

	const processNextTask = (currentState: PoolState<TArgs, TReturn>) => {
		if (isTerminating || currentState.taskQueue.length === 0) {
			return
		}

		const availableWorker = currentState.workers.find((w) => {
			return !currentState.busyWorkers.has(w)
		})
		if (!availableWorker) {
			return
		}

		const newState: PoolState<TArgs, TReturn> = {
			workers: currentState.workers,
			busyWorkers: new Set([
				...currentState.busyWorkers,
				availableWorker,
			]),
			taskQueue: currentState.taskQueue,
			completedTasks: currentState.completedTasks,
			totalTasks: currentState.totalTasks,
		}

		state = newState
		availableWorker.postMessage(newState.taskQueue[0].args)
	}

	const handleWorkerError = async (error: Error, task: Task<TArgs, TReturn>) => {
		if (globalErrorHandler) {
			await Promise.resolve(globalErrorHandler(error))
		}
		task.reject(error)
	}

	const setupWorker = (
		worker: Worker,
		onMessage: (msg: WorkerMessage<TReturn>) => void,
		onError: (error: Error) => void,
	): void => {
		worker.on('message', onMessage)
		worker.on('error', onError)
	}

	const initialize = () => {
		if (state) {
			return state
		}
		const newState = createInitialState()

		for (const worker of newState.workers) {
			setupWorker(
				worker,
				(msg: unknown) => {
					if (!state) {
						return
					}

					if (isConsoleMessage(msg)) {
						console[msg.method](...msg.args)
						return
					}

					if (state.taskQueue.length === 0) {
						return
					}

					const task = state.taskQueue[0]

					const updatedState: PoolState<TArgs, TReturn> = {
						workers: state.workers,
						busyWorkers: new Set([
							...state.busyWorkers,
						].filter((w) => {
							return w !== worker
						})),
						taskQueue: state.taskQueue.slice(1),
						completedTasks: state.completedTasks + 1,
						totalTasks: state.totalTasks,
					}

					state = updatedState

					if (isWorkerErrorMessage(msg)) {
						handleWorkerError(new Error(msg.error), task)
					} else if (isWorkerSuccessMessage<TReturn>(msg)) {
						task.resolve(msg.result)
					}

					processNextTask(updatedState)
					checkAndTerminate(updatedState)
				},
				(error) => {
					if (!state || state.taskQueue.length === 0) {
						return
					}
					const task = state.taskQueue[0]
					handleWorkerError(error, task)
				},
			)
		}

		state = newState
		return newState
	}

	return {
		queue: (...args: TArgs) => {
			if (isTerminating) {
				throw new Error('Pool is terminating')
			}

			const promise = (async () => {
				const currentState = initialize()

				return new Promise<TReturn>((resolve, reject) => {
					const newState: PoolState<TArgs, TReturn> = {
						workers: currentState.workers,
						busyWorkers: currentState.busyWorkers,
						taskQueue: [
							...currentState.taskQueue,
							{
								args,
								resolve,
								reject,
							},
						],
						completedTasks: currentState.completedTasks,
						totalTasks: currentState.totalTasks + 1,
					}

					state = newState
					processNextTask(newState)
				})
			})()

			const wrappedPromise = promise.catch((error: unknown) => {
				if (!(error instanceof Error)) {
					throw new TypeError(String(error))
				}
				throw error
			})

			return {
				handleError: async (handler: (error: Error) => void | Promise<void>) => {
					return promise.catch(async (error: unknown) => {
						if (error instanceof Error) {
							await Promise.resolve(handler(error))
						} else {
							await Promise.resolve(handler(new Error(String(error))))
						}
						return undefined
					})
				},
				then: wrappedPromise.then.bind(wrappedPromise),
				catch: wrappedPromise.catch.bind(wrappedPromise),
				finally: wrappedPromise.finally.bind(wrappedPromise),
			}
		},

		terminateWhenDone: async (): Promise<void> => {
			if (!state || isTerminating) {
				return
			}
			isTerminating = true

			if (state.completedTasks === state.totalTasks) {
				await Promise.all(state.workers.map(async (worker) => {
					return new Promise<void>((resolve) => {
						worker.once('exit', () => {
							resolve()
						})
						void worker.terminate()
					})
				}))
				state = null
				isTerminating = false

				return
			}

			await new Promise<void>((resolve) => {
				terminateResolve = resolve
			})

			await Promise.all(state.workers.map(async (worker) => {
				return new Promise<void>((resolve) => {
					worker.once('exit', () => {
						resolve()
					})
					void worker.terminate()
				})
			}))

			state = null
			isTerminating = false
			terminateResolve = null
		},
	}
}

// Single worker execution
const runSingleWorker = async <TArgs extends readonly unknown[], TReturn>(
	fn: WorkerFunction<TArgs, TReturn>,
	...args: TArgs
): Promise<TReturn> => {
	const config = getWorkerPath()
	const worker = new Worker(config.workerPath, createWorkerOptions(config.nodePath))

	try {
		return await new Promise<TReturn>((resolve, reject) => {
			const timeout = setTimeout(() => {
				void worker.terminate()
				reject(new Error('Worker timed out'))
			}, 5000)

			worker.on('message', (msg: unknown) => {
				if (isConsoleMessage(msg)) {
					console[msg.method](...msg.args)

					return
				}

				clearTimeout(timeout)
				if (isWorkerErrorMessage(msg)) {
					reject(new Error(msg.error))
				} else if (isWorkerSuccessMessage<TReturn>(msg)) {
					resolve(msg.result)
				}
			})

			worker.on('error', (error: Error) => {
				clearTimeout(timeout)
				reject(error)
			})

			worker.postMessage(args)
		})
	} finally {
		await new Promise<void>((resolve) => {
			worker.once('exit', () => {
				resolve()
			})
			void worker.terminate()
		})
	}
}

const setupWorkerThread = <TArgs extends readonly unknown[], TReturn>(
	fn: WorkerFunction<TArgs, TReturn>,
): void => {
	if (!parentPort) {
		throw new Error('This module must be run as a worker')
	}

	// Set up console forwarding
	const forwardConsole = (method: ConsoleMethod, args: ConsoleArgs) => {
		parentPort?.postMessage({
			__consoleLog: true,
			method,
			args: args.map((arg) => {
				return arg instanceof Error ? arg.stack ?? arg.message : arg
			}),
		})
	}

	const originalConsole = {
		...console,
	}

	for (const method of CONSOLE_METHODS) {
		console[method] = (...args: ConsoleArgs) => {
			originalConsole[method](...args)
			forwardConsole(method, args)
		}
	}

	// Handle messages
	parentPort.on('message', async (args: TArgs) => {
		try {
			const result = await fn(...args)
			parentPort?.postMessage({
				result,
			})
		} catch (error) {
			console.error(error)
			parentPort?.postMessage({
				error: error instanceof Error ? error.message : String(error),
			})
		}
	})
}

// Main export
export default function run<TArgs extends readonly unknown[], TReturn>(
	fn: WorkerFunction<TArgs, TReturn>,
): RunResult<TArgs, TReturn> {
	if (!isMainThread) {
		setupWorkerThread(fn)
		return null as any
	}

	return {
		createPool(options?: PoolOptions) {
			return createWorkerPool(fn, options)
		},
		async run(...args: TArgs): Promise<TReturn> {
			return runSingleWorker(fn, ...args)
		},
	}
}