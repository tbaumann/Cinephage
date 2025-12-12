/**
 * Browser Pool Manager
 *
 * Manages a pool of warm Playwright browser instances for solving
 * Cloudflare challenges. Implements instance lifecycle management,
 * queuing for busy periods, and health monitoring.
 */

import { chromium, type Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { createChildLogger } from '$lib/logging';
import type {
	BrowserSolverConfig,
	BrowserInstance,
	BrowserPoolHealth,
	QueuedRequest
} from './types';
import {
	STEALTH_LAUNCH_ARGS,
	STEALTH_CONTEXT_OPTIONS,
	MAX_INSTANCE_USES,
	MAX_INSTANCE_AGE_MS
} from './config';

const log = createChildLogger({ module: 'BrowserPool' });

/**
 * Browser Pool for managing Playwright browser instances.
 *
 * Features:
 * - Maintains a pool of warm browser instances for fast acquire times
 * - Queues requests when all instances are busy
 * - Automatically recycles instances after max uses or age
 * - Provides health monitoring and metrics
 */
export class BrowserPool {
	private instances: Map<string, BrowserInstance> = new Map();
	private queue: QueuedRequest[] = [];
	private config: BrowserSolverConfig;
	private isShuttingDown = false;
	private isInitialized = false;

	// Metrics for health monitoring
	private totalSolves = 0;
	private successfulSolves = 0;
	private recentSolveTimes: number[] = [];
	private lastError?: string;

	constructor(config: BrowserSolverConfig) {
		this.config = config;
	}

	/**
	 * Initialize the browser pool with warm instances.
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			log.warn('BrowserPool already initialized');
			return;
		}

		if (!this.config.enabled) {
			log.info('BrowserPool disabled by configuration');
			return;
		}

		log.info('Initializing browser pool', {
			poolSize: this.config.poolSize,
			headless: this.config.headless
		});

		try {
			// Create initial pool of browser instances
			const createPromises: Promise<BrowserInstance>[] = [];
			for (let i = 0; i < this.config.poolSize; i++) {
				createPromises.push(this.createInstance());
			}

			await Promise.all(createPromises);
			this.isInitialized = true;

			log.info('Browser pool initialized', {
				instances: this.instances.size
			});
		} catch (error) {
			log.error('Failed to initialize browser pool', error);
			throw error;
		}
	}

	/**
	 * Create a new browser instance and add it to the pool.
	 */
	private async createInstance(): Promise<BrowserInstance> {
		const id = randomUUID();

		log.debug('Creating browser instance', { id });

		try {
			// Launch browser with stealth settings
			const browser = await chromium.launch({
				headless: this.config.headless,
				args: STEALTH_LAUNCH_ARGS
			});

			// Create context with stealth options
			const contextOptions = {
				...STEALTH_CONTEXT_OPTIONS,
				userAgent: this.config.userAgent,
				...(this.config.proxy && {
					proxy: {
						server: this.config.proxy.server,
						username: this.config.proxy.username,
						password: this.config.proxy.password
					}
				})
			};

			const context = await browser.newContext(contextOptions);

			// Create page and inject stealth scripts
			const page = await context.newPage();
			await this.injectStealthScripts(page);

			const instance: BrowserInstance = {
				id,
				browser,
				context,
				page,
				createdAt: new Date(),
				lastUsedAt: new Date(),
				useCount: 0,
				isAvailable: true
			};

			this.instances.set(id, instance);

			log.debug('Browser instance created', { id });

			return instance;
		} catch (error) {
			log.error('Failed to create browser instance', error, { id });
			throw error;
		}
	}

	/**
	 * Inject stealth scripts to avoid detection.
	 */
	private async injectStealthScripts(page: Page): Promise<void> {
		// Override navigator.webdriver to return undefined
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', {
				get: () => undefined
			});

			// Override Chrome automation properties
			Object.defineProperty(navigator, 'plugins', {
				get: () => [1, 2, 3, 4, 5]
			});

			// Override languages to look more natural
			Object.defineProperty(navigator, 'languages', {
				get: () => ['en-US', 'en']
			});

			// Remove automation-related window properties
			// @ts-expect-error - removing automation properties
			delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
			// @ts-expect-error - removing automation properties
			delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
			// @ts-expect-error - removing automation properties
			delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
		});
	}

	/**
	 * Acquire a browser instance from the pool.
	 * Returns immediately if available, otherwise queues the request.
	 */
	async acquire(timeout?: number): Promise<BrowserInstance> {
		if (this.isShuttingDown) {
			throw new Error('Browser pool is shutting down');
		}

		if (!this.isInitialized) {
			throw new Error('Browser pool not initialized');
		}

		// Look for an available instance
		for (const instance of this.instances.values()) {
			if (instance.isAvailable) {
				instance.isAvailable = false;
				instance.lastUsedAt = new Date();
				instance.useCount++;

				log.debug('Acquired browser instance', {
					id: instance.id,
					useCount: instance.useCount
				});

				return instance;
			}
		}

		// No available instance, queue the request
		const effectiveTimeout = timeout ?? this.config.solveTimeoutMs;

		return new Promise<BrowserInstance>((resolve, reject) => {
			const queuedRequest: QueuedRequest = {
				resolve,
				reject,
				options: { url: '', timeout: effectiveTimeout },
				queuedAt: new Date()
			};

			this.queue.push(queuedRequest);

			log.debug('Request queued', {
				queuePosition: this.queue.length,
				timeout: effectiveTimeout
			});

			// Set timeout for queued request
			setTimeout(() => {
				const index = this.queue.indexOf(queuedRequest);
				if (index !== -1) {
					this.queue.splice(index, 1);
					reject(new Error(`Timed out waiting for browser instance (${effectiveTimeout}ms)`));
				}
			}, effectiveTimeout);
		});
	}

	/**
	 * Release a browser instance back to the pool.
	 */
	async release(instance: BrowserInstance): Promise<void> {
		const poolInstance = this.instances.get(instance.id);
		if (!poolInstance) {
			log.warn('Attempted to release unknown instance', { id: instance.id });
			return;
		}

		// Check if instance needs recycling
		const age = Date.now() - poolInstance.createdAt.getTime();
		const needsRecycle = poolInstance.useCount >= MAX_INSTANCE_USES || age >= MAX_INSTANCE_AGE_MS;

		if (needsRecycle) {
			log.debug('Recycling browser instance', {
				id: instance.id,
				useCount: poolInstance.useCount,
				ageMs: age
			});

			await this.recycleInstance(instance.id);
		} else {
			// Clear page state for next use
			try {
				await poolInstance.page.goto('about:blank', { timeout: 5000 });
			} catch {
				// Ignore errors when clearing page
			}

			poolInstance.isAvailable = true;

			// Process queued requests
			this.processQueue();
		}
	}

	/**
	 * Process queued requests when an instance becomes available.
	 */
	private processQueue(): void {
		if (this.queue.length === 0) return;

		// Find an available instance
		for (const instance of this.instances.values()) {
			if (instance.isAvailable && this.queue.length > 0) {
				const request = this.queue.shift()!;
				instance.isAvailable = false;
				instance.lastUsedAt = new Date();
				instance.useCount++;

				log.debug('Dequeued request', {
					id: instance.id,
					remainingQueue: this.queue.length
				});

				request.resolve(instance);
			}
		}
	}

	/**
	 * Recycle a browser instance (close and create new).
	 */
	private async recycleInstance(id: string): Promise<void> {
		const instance = this.instances.get(id);
		if (!instance) return;

		// Remove from pool
		this.instances.delete(id);

		// Close the old instance
		try {
			await instance.context.close();
			await instance.browser.close();
		} catch (error) {
			log.error('Error closing recycled instance', error, { id });
		}

		// Create a replacement if not shutting down
		if (!this.isShuttingDown) {
			try {
				const newInstance = await this.createInstance();
				// Process queue with new instance
				if (this.queue.length > 0) {
					const request = this.queue.shift()!;
					newInstance.isAvailable = false;
					newInstance.lastUsedAt = new Date();
					newInstance.useCount++;
					request.resolve(newInstance);
				}
			} catch (error) {
				log.error('Failed to create replacement instance', error);
			}
		}
	}

	/**
	 * Record a solve result for metrics.
	 */
	recordSolveResult(success: boolean, solveTimeMs: number): void {
		this.totalSolves++;
		if (success) {
			this.successfulSolves++;
		}

		this.recentSolveTimes.push(solveTimeMs);
		// Keep only last 100 solve times
		if (this.recentSolveTimes.length > 100) {
			this.recentSolveTimes.shift();
		}
	}

	/**
	 * Record an error for health monitoring.
	 */
	recordError(error: string): void {
		this.lastError = error;
	}

	/**
	 * Get pool health status.
	 */
	getHealth(): BrowserPoolHealth {
		let availableInstances = 0;
		let busyInstances = 0;

		for (const instance of this.instances.values()) {
			if (instance.isAvailable) {
				availableInstances++;
			} else {
				busyInstances++;
			}
		}

		const averageSolveTimeMs =
			this.recentSolveTimes.length > 0
				? this.recentSolveTimes.reduce((a, b) => a + b, 0) / this.recentSolveTimes.length
				: 0;

		const successRate = this.totalSolves > 0 ? this.successfulSolves / this.totalSolves : 0;

		return {
			totalInstances: this.instances.size,
			availableInstances,
			busyInstances,
			queuedRequests: this.queue.length,
			averageSolveTimeMs: Math.round(averageSolveTimeMs),
			successRate: Math.round(successRate * 100) / 100,
			lastError: this.lastError
		};
	}

	/**
	 * Check if the pool is initialized and has available capacity.
	 */
	isReady(): boolean {
		return this.isInitialized && !this.isShuttingDown;
	}

	/**
	 * Gracefully shutdown the browser pool.
	 */
	async shutdown(): Promise<void> {
		if (this.isShuttingDown) {
			log.warn('Browser pool already shutting down');
			return;
		}

		this.isShuttingDown = true;
		log.info('Shutting down browser pool', { instances: this.instances.size });

		// Reject all queued requests
		for (const request of this.queue) {
			request.reject(new Error('Browser pool is shutting down'));
		}
		this.queue = [];

		// Close all browser instances
		const closePromises: Promise<void>[] = [];
		for (const instance of this.instances.values()) {
			closePromises.push(
				(async () => {
					try {
						await instance.context.close();
						await instance.browser.close();
					} catch (error) {
						log.error('Error closing instance during shutdown', error, { id: instance.id });
					}
				})()
			);
		}

		await Promise.all(closePromises);
		this.instances.clear();
		this.isInitialized = false;

		log.info('Browser pool shutdown complete');
	}
}
