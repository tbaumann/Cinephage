/**
 * Browser Solver Service
 *
 * Main orchestration service for solving Cloudflare challenges using
 * headless Chromium. Manages the browser pool, solution caching,
 * and coordinates challenge solving.
 */

import { createChildLogger } from '$lib/logging';
import type {
	BrowserSolverConfig,
	BrowserPoolHealth,
	CachedSolution,
	SolveOptions,
	SolveResult,
	SolverMetrics
} from './types';
import { BrowserPool } from './BrowserPool';
import { ChallengeSolver } from './ChallengeSolver';
import { DEFAULT_CONFIG, getConfig } from './config';

const log = createChildLogger({ module: 'BrowserSolver' });

/**
 * Browser Solver Service.
 *
 * Provides a high-level API for solving Cloudflare challenges:
 * - Manages browser instance pool
 * - Caches solutions per host
 * - Handles initialization and shutdown
 * - Exposes health metrics
 */
export class BrowserSolver {
	private pool: BrowserPool;
	private challengeSolver: ChallengeSolver;
	private solutionCache: Map<string, CachedSolution> = new Map();
	private config: BrowserSolverConfig;
	private isInitialized = false;
	private cacheCleanupInterval?: ReturnType<typeof setInterval>;

	// Metrics
	private metrics: SolverMetrics = {
		totalAttempts: 0,
		successfulSolves: 0,
		failedSolves: 0,
		cacheHits: 0,
		averageSolveTimeMs: 0,
		recentSolveTimes: []
	};

	constructor(config?: Partial<BrowserSolverConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.pool = new BrowserPool(this.config);
		this.challengeSolver = new ChallengeSolver();
	}

	/**
	 * Initialize the browser solver.
	 * Must be called before using solve().
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			log.warn('BrowserSolver already initialized');
			return;
		}

		if (!this.config.enabled) {
			log.info('BrowserSolver disabled by configuration');
			return;
		}

		log.info('Initializing BrowserSolver', {
			poolSize: this.config.poolSize,
			maxConcurrent: this.config.maxConcurrent,
			headless: this.config.headless
		});

		try {
			await this.pool.initialize();
			this.isInitialized = true;

			// Start cache cleanup interval (every 5 minutes)
			this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 5 * 60 * 1000);

			log.info('BrowserSolver initialized successfully');
		} catch (error) {
			log.error('Failed to initialize BrowserSolver', error);
			throw error;
		}
	}

	/**
	 * Check if the solver is enabled and ready.
	 */
	isEnabled(): boolean {
		return this.config.enabled && this.isInitialized;
	}

	/**
	 * Check if the solver is ready to handle requests.
	 */
	isReady(): boolean {
		return this.isEnabled() && this.pool.isReady();
	}

	/**
	 * Solve a Cloudflare challenge for the given URL.
	 */
	async solve(options: SolveOptions): Promise<SolveResult> {
		if (!this.isEnabled()) {
			return {
				success: false,
				cookies: {},
				expirations: {},
				error: 'BrowserSolver not initialized or disabled',
				solveTimeMs: 0
			};
		}

		const host = new URL(options.url).hostname;
		this.metrics.totalAttempts++;

		// Check cache first (unless forceSolve is set)
		if (!options.forceSolve) {
			const cached = this.getCachedSolution(host);
			if (cached) {
				this.metrics.cacheHits++;
				log.debug('Using cached solution', {
					host,
					indexerId: options.indexerId,
					expiresIn: Math.round((cached.expiresAt.getTime() - Date.now()) / 1000) + 's'
				});

				return {
					success: true,
					cookies: cached.cookies,
					expirations: cached.expirations,
					solveTimeMs: 0,
					challengeType: cached.challengeType
				};
			}
		}

		log.info('Solving challenge', {
			url: options.url,
			host,
			indexerId: options.indexerId
		});

		// Acquire browser instance
		let instance;
		try {
			instance = await this.pool.acquire(options.timeout);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to acquire browser';
			log.error('Failed to acquire browser instance', error);
			this.metrics.failedSolves++;
			return {
				success: false,
				cookies: {},
				expirations: {},
				error: message,
				solveTimeMs: 0
			};
		}

		try {
			// Solve the challenge
			const result = await this.challengeSolver.solve(instance.page, {
				...options,
				timeout: options.timeout ?? this.config.solveTimeoutMs
			});

			// Record metrics
			this.pool.recordSolveResult(result.success, result.solveTimeMs);
			this.recordSolveMetrics(result);

			if (result.success) {
				// Cache the solution
				this.cacheSolution(host, result);

				log.info('Challenge solved successfully', {
					host,
					challengeType: result.challengeType,
					solveTimeMs: result.solveTimeMs,
					cookieCount: Object.keys(result.cookies).length
				});
			} else {
				log.warn('Challenge solve failed', {
					host,
					error: result.error,
					solveTimeMs: result.solveTimeMs
				});
				this.pool.recordError(result.error ?? 'Unknown error');
			}

			return result;
		} finally {
			// Always release instance back to pool
			await this.pool.release(instance);
		}
	}

	/**
	 * Get a cached solution for a host if still valid.
	 */
	private getCachedSolution(host: string): CachedSolution | null {
		const cached = this.solutionCache.get(host);
		if (!cached) return null;

		// Check if expired
		if (new Date() > cached.expiresAt) {
			this.solutionCache.delete(host);
			return null;
		}

		return cached;
	}

	/**
	 * Cache a successful solution.
	 */
	private cacheSolution(host: string, result: SolveResult): void {
		const expiresAt = new Date(Date.now() + this.config.cookieCacheTtlMs);

		// Use cookie expiration if available and earlier
		const cfExpiration = result.expirations['cf_clearance'];
		if (cfExpiration && cfExpiration < expiresAt) {
			// Use cf_clearance expiration, minus some buffer
			expiresAt.setTime(cfExpiration.getTime() - 60000);
		}

		const cachedSolution: CachedSolution = {
			host,
			cookies: result.cookies,
			expirations: result.expirations,
			solvedAt: new Date(),
			expiresAt,
			challengeType: result.challengeType ?? 'unknown'
		};

		this.solutionCache.set(host, cachedSolution);

		log.debug('Cached solution', {
			host,
			expiresAt: expiresAt.toISOString(),
			cookieCount: Object.keys(result.cookies).length
		});
	}

	/**
	 * Record solve metrics.
	 */
	private recordSolveMetrics(result: SolveResult): void {
		if (result.success) {
			this.metrics.successfulSolves++;
		} else {
			this.metrics.failedSolves++;
		}

		this.metrics.recentSolveTimes.push(result.solveTimeMs);
		if (this.metrics.recentSolveTimes.length > 100) {
			this.metrics.recentSolveTimes.shift();
		}

		this.metrics.averageSolveTimeMs =
			this.metrics.recentSolveTimes.reduce((a, b) => a + b, 0) /
			this.metrics.recentSolveTimes.length;
	}

	/**
	 * Clean up expired cache entries.
	 */
	private cleanupCache(): void {
		const now = new Date();
		let removed = 0;

		for (const [host, solution] of this.solutionCache) {
			if (now > solution.expiresAt) {
				this.solutionCache.delete(host);
				removed++;
			}
		}

		if (removed > 0) {
			log.debug('Cleaned up expired cache entries', {
				removed,
				remaining: this.solutionCache.size
			});
		}
	}

	/**
	 * Invalidate cached solution for a host.
	 */
	invalidateCache(host: string): void {
		if (this.solutionCache.delete(host)) {
			log.debug('Invalidated cache for host', { host });
		}
	}

	/**
	 * Clear all cached solutions.
	 */
	clearCache(): void {
		const count = this.solutionCache.size;
		this.solutionCache.clear();
		log.debug('Cleared solution cache', { entriesRemoved: count });
	}

	/**
	 * Get health status and metrics.
	 */
	getHealth(): BrowserPoolHealth & { cacheSize: number; metrics: SolverMetrics } {
		return {
			...this.pool.getHealth(),
			cacheSize: this.solutionCache.size,
			metrics: { ...this.metrics }
		};
	}

	/**
	 * Gracefully shutdown the browser solver.
	 */
	async shutdown(): Promise<void> {
		if (!this.isInitialized) {
			log.warn('BrowserSolver not initialized, nothing to shutdown');
			return;
		}

		log.info('Shutting down BrowserSolver');

		// Stop cache cleanup
		if (this.cacheCleanupInterval) {
			clearInterval(this.cacheCleanupInterval);
			this.cacheCleanupInterval = undefined;
		}

		// Shutdown pool
		await this.pool.shutdown();

		// Clear cache
		this.solutionCache.clear();
		this.isInitialized = false;

		log.info('BrowserSolver shutdown complete');
	}
}

// Singleton instance
let browserSolverInstance: BrowserSolver | null = null;

/**
 * Get the singleton BrowserSolver instance.
 * Creates a new instance with environment config if not exists.
 */
export function getBrowserSolver(): BrowserSolver {
	if (!browserSolverInstance) {
		const config = getConfig();
		browserSolverInstance = new BrowserSolver(config);
	}
	return browserSolverInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export async function resetBrowserSolver(): Promise<void> {
	if (browserSolverInstance) {
		await browserSolverInstance.shutdown();
		browserSolverInstance = null;
	}
}
