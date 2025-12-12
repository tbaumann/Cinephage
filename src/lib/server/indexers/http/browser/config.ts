/**
 * Configuration for the Browser Solver module.
 *
 * Provides default configuration and environment variable parsing
 * for the Cloudflare bypass browser solver.
 */

import type { BrowserSolverConfig } from './types';

/**
 * Default browser solver configuration.
 *
 * These defaults are optimized for reliability-first operation:
 * - 2 warm instances for fast response times
 * - 60 second timeout for complex challenges
 * - 1 hour cache TTL for cf_clearance cookies
 */
export const DEFAULT_CONFIG: BrowserSolverConfig = {
	enabled: true,
	poolSize: 2,
	maxConcurrent: 3,
	solveTimeoutMs: 60_000,
	cookieCacheTtlMs: 3_600_000, // 1 hour
	headless: true,
	userAgent:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Chrome launch arguments for stealth operation.
 *
 * These arguments help avoid bot detection by:
 * - Disabling automation flags that reveal headless mode
 * - Setting realistic window size
 * - Disabling features that can fingerprint automation
 */
export const STEALTH_LAUNCH_ARGS = [
	// Disable automation detection
	'--disable-blink-features=AutomationControlled',

	// Memory and resource optimization
	'--disable-dev-shm-usage',
	'--disable-gpu',

	// Required for running as root in containers
	'--no-sandbox',
	'--disable-setuid-sandbox',

	// Disable unnecessary features
	'--disable-extensions',
	'--disable-background-networking',
	'--disable-background-timer-throttling',
	'--disable-backgrounding-occluded-windows',
	'--disable-breakpad',
	'--disable-component-extensions-with-background-pages',
	'--disable-component-update',
	'--disable-default-apps',
	'--disable-hang-monitor',
	'--disable-ipc-flooding-protection',
	'--disable-popup-blocking',
	'--disable-prompt-on-repost',
	'--disable-renderer-backgrounding',
	'--disable-sync',
	'--disable-translate',

	// Set window size for consistent rendering
	'--window-size=1920,1080',

	// Disable features that reveal automation
	'--enable-features=NetworkService,NetworkServiceInProcess',
	'--force-color-profile=srgb'
];

/**
 * Browser context options for stealth operation.
 */
export const STEALTH_CONTEXT_OPTIONS = {
	viewport: { width: 1920, height: 1080 },
	locale: 'en-US',
	timezoneId: 'America/New_York',
	bypassCSP: true,
	javaScriptEnabled: true,
	ignoreHTTPSErrors: true
};

/**
 * Maximum number of uses before recycling a browser instance.
 * This helps prevent memory leaks and ensures fresh state.
 */
export const MAX_INSTANCE_USES = 50;

/**
 * Maximum age of a browser instance in milliseconds before recycling.
 * Even with low usage, instances are recycled after this time.
 */
export const MAX_INSTANCE_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Load configuration from environment variables.
 */
export function loadConfigFromEnv(): Partial<BrowserSolverConfig> {
	const config: Partial<BrowserSolverConfig> = {};

	if (process.env.BROWSER_SOLVER_ENABLED !== undefined) {
		config.enabled = process.env.BROWSER_SOLVER_ENABLED === 'true';
	}

	if (process.env.BROWSER_SOLVER_POOL_SIZE !== undefined) {
		const poolSize = parseInt(process.env.BROWSER_SOLVER_POOL_SIZE, 10);
		if (!isNaN(poolSize) && poolSize >= 1 && poolSize <= 10) {
			config.poolSize = poolSize;
		}
	}

	if (process.env.BROWSER_SOLVER_MAX_CONCURRENT !== undefined) {
		const maxConcurrent = parseInt(process.env.BROWSER_SOLVER_MAX_CONCURRENT, 10);
		if (!isNaN(maxConcurrent) && maxConcurrent >= 1 && maxConcurrent <= 10) {
			config.maxConcurrent = maxConcurrent;
		}
	}

	if (process.env.BROWSER_SOLVER_TIMEOUT !== undefined) {
		const timeout = parseInt(process.env.BROWSER_SOLVER_TIMEOUT, 10);
		if (!isNaN(timeout) && timeout >= 10 && timeout <= 300) {
			config.solveTimeoutMs = timeout * 1000; // Convert seconds to ms
		}
	}

	if (process.env.BROWSER_SOLVER_CACHE_TTL !== undefined) {
		const ttl = parseInt(process.env.BROWSER_SOLVER_CACHE_TTL, 10);
		if (!isNaN(ttl) && ttl >= 60 && ttl <= 86400) {
			config.cookieCacheTtlMs = ttl * 1000; // Convert seconds to ms
		}
	}

	if (process.env.BROWSER_SOLVER_HEADLESS !== undefined) {
		config.headless = process.env.BROWSER_SOLVER_HEADLESS !== 'false';
	}

	if (process.env.BROWSER_SOLVER_USER_AGENT !== undefined) {
		config.userAgent = process.env.BROWSER_SOLVER_USER_AGENT;
	}

	// Proxy configuration
	if (process.env.BROWSER_SOLVER_PROXY !== undefined) {
		const proxyUrl = process.env.BROWSER_SOLVER_PROXY;
		if (proxyUrl) {
			config.proxy = {
				server: proxyUrl,
				username: process.env.BROWSER_SOLVER_PROXY_USER,
				password: process.env.BROWSER_SOLVER_PROXY_PASS
			};
		}
	}

	return config;
}

/**
 * Get the full configuration by merging defaults with environment overrides.
 */
export function getConfig(): BrowserSolverConfig {
	const envConfig = loadConfigFromEnv();
	return { ...DEFAULT_CONFIG, ...envConfig };
}
