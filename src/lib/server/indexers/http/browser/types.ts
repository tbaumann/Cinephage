/**
 * Type definitions for the Browser Solver module.
 *
 * The Browser Solver provides Cloudflare bypass capabilities using
 * headless Chromium to solve JavaScript challenges and Turnstile widgets.
 */

import type { Browser, BrowserContext, Page } from 'playwright';

/**
 * Browser solver configuration options.
 */
export interface BrowserSolverConfig {
	/** Enable/disable the solver globally */
	enabled: boolean;
	/** Number of browser instances to keep warm in the pool */
	poolSize: number;
	/** Maximum concurrent solve operations */
	maxConcurrent: number;
	/** Timeout for challenge solving in milliseconds */
	solveTimeoutMs: number;
	/** How long to cache solved cookies in milliseconds */
	cookieCacheTtlMs: number;
	/** Run browser in headless mode */
	headless: boolean;
	/** User agent string to use */
	userAgent: string;
	/** Optional proxy configuration */
	proxy?: ProxyConfig;
}

/**
 * Proxy configuration for browser requests.
 */
export interface ProxyConfig {
	/** Proxy server URL (e.g., http://proxy:8080) */
	server: string;
	/** Proxy username (optional) */
	username?: string;
	/** Proxy password (optional) */
	password?: string;
}

/**
 * Challenge types that the solver can handle.
 */
export type ChallengeType = 'js-challenge' | 'turnstile' | 'managed' | 'unknown';

/**
 * Result of a solve operation.
 */
export interface SolveResult {
	/** Whether the challenge was solved successfully */
	success: boolean;
	/** Cookies extracted from the browser (includes cf_clearance) */
	cookies: Record<string, string>;
	/** Cookie expiration times */
	expirations: Record<string, Date>;
	/** Final page content after challenge was solved */
	content?: string;
	/** Final URL after any redirects */
	finalUrl?: string;
	/** Error message if solving failed */
	error?: string;
	/** Time taken to solve the challenge in milliseconds */
	solveTimeMs: number;
	/** Type of challenge that was solved */
	challengeType?: ChallengeType;
}

/**
 * A managed browser instance in the pool.
 */
export interface BrowserInstance {
	/** Unique identifier for this instance */
	id: string;
	/** Playwright browser instance */
	browser: Browser;
	/** Browser context with stealth settings */
	context: BrowserContext;
	/** Main page for requests */
	page: Page;
	/** When this instance was created */
	createdAt: Date;
	/** When this instance was last used */
	lastUsedAt: Date;
	/** Number of times this instance has been used */
	useCount: number;
	/** Whether this instance is available for use */
	isAvailable: boolean;
}

/**
 * Options for a solve request.
 */
export interface SolveOptions {
	/** URL to solve the challenge for */
	url: string;
	/** HTTP method (default: GET) */
	method?: 'GET' | 'POST';
	/** Request headers to include */
	headers?: Record<string, string>;
	/** POST body if method is POST */
	body?: string;
	/** Maximum time to wait for solution in milliseconds */
	timeout?: number;
	/** Indexer ID for logging and tracking */
	indexerId?: string;
	/** Force re-solve even if cached cookies exist */
	forceSolve?: boolean;
}

/**
 * A cached solution entry.
 */
export interface CachedSolution {
	/** Host this solution is for */
	host: string;
	/** Solved cookies */
	cookies: Record<string, string>;
	/** Cookie expiration times */
	expirations: Record<string, Date>;
	/** When this solution was obtained */
	solvedAt: Date;
	/** When this cached entry expires */
	expiresAt: Date;
	/** Type of challenge that was solved */
	challengeType: ChallengeType;
}

/**
 * Health status of the browser pool.
 */
export interface BrowserPoolHealth {
	/** Total browser instances in the pool */
	totalInstances: number;
	/** Instances available for use */
	availableInstances: number;
	/** Instances currently busy solving */
	busyInstances: number;
	/** Number of requests waiting in queue */
	queuedRequests: number;
	/** Average time to solve challenges in milliseconds */
	averageSolveTimeMs: number;
	/** Success rate (0-1) of recent solves */
	successRate: number;
	/** Most recent error message if any */
	lastError?: string;
}

/**
 * Queued solve request waiting for an available instance.
 */
export interface QueuedRequest {
	/** Resolve function to call with the acquired instance */
	resolve: (instance: BrowserInstance) => void;
	/** Reject function to call on timeout/error */
	reject: (error: Error) => void;
	/** Options for the solve request */
	options: SolveOptions;
	/** When this request was queued */
	queuedAt: Date;
}

/**
 * Metrics for monitoring the solver's performance.
 */
export interface SolverMetrics {
	/** Total number of solve attempts */
	totalAttempts: number;
	/** Number of successful solves */
	successfulSolves: number;
	/** Number of failed solves */
	failedSolves: number;
	/** Number of cache hits */
	cacheHits: number;
	/** Average solve time in milliseconds */
	averageSolveTimeMs: number;
	/** Solve times for calculating averages (sliding window) */
	recentSolveTimes: number[];
}
