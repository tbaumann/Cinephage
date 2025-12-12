/**
 * Browser Solver Module
 *
 * Provides Cloudflare bypass capabilities using headless Chromium.
 * Handles JavaScript challenges and Turnstile widgets.
 *
 * @example
 * ```typescript
 * import { getBrowserSolver } from '$lib/server/indexers/http/browser';
 *
 * // Initialize at startup
 * const solver = getBrowserSolver();
 * await solver.initialize();
 *
 * // Solve a challenge
 * const result = await solver.solve({
 *   url: 'https://example.com',
 *   indexerId: 'my-indexer'
 * });
 *
 * if (result.success) {
 *   console.log('Cookies:', result.cookies);
 * }
 * ```
 */

// Main service
export { BrowserSolver, getBrowserSolver, resetBrowserSolver } from './BrowserSolver';

// Components
export { BrowserPool } from './BrowserPool';
export { ChallengeSolver } from './ChallengeSolver';
export { TurnstileSolver } from './TurnstileSolver';
export { CookieExtractor } from './CookieExtractor';

// Configuration
export { DEFAULT_CONFIG, getConfig, loadConfigFromEnv } from './config';

// Types
export type {
	BrowserSolverConfig,
	BrowserInstance,
	BrowserPoolHealth,
	CachedSolution,
	ChallengeType,
	ProxyConfig,
	QueuedRequest,
	SolveOptions,
	SolveResult,
	SolverMetrics
} from './types';
