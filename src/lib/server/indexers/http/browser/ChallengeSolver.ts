/**
 * Challenge Solver
 *
 * Main coordinator for solving Cloudflare challenges. Detects the
 * challenge type and delegates to the appropriate solver.
 */

import type { Page } from 'playwright';
import { createChildLogger } from '$lib/logging';
import type { ChallengeType, SolveOptions, SolveResult } from './types';
import { CookieExtractor } from './CookieExtractor';
import { TurnstileSolver } from './TurnstileSolver';

const log = createChildLogger({ module: 'ChallengeSolver' });

/**
 * Patterns for detecting different Cloudflare challenge types.
 * These are based on Cloudflare's HTML responses.
 */
const CHALLENGE_PATTERNS = {
	// JavaScript challenge (most common)
	jsChallenge: [
		'<title>Just a moment...</title>',
		'cf_chl_opt',
		'__cf_chl_tk',
		'_cf_chl_opt',
		'cf-browser-verification'
	],
	// Turnstile widget
	turnstile: ['cf-turnstile', 'challenges.cloudflare.com/turnstile', 'turnstile/v0/api.js'],
	// Managed challenge (interactive)
	managed: ['cf-challenge-running', 'cf-chl-widget-'],
	// Access denied (might need cookies or is blocked)
	accessDenied: ['error code: 1020', '<title>Access denied</title>', 'You have been blocked'],
	// Rate limited
	rateLimited: ['<title>Attention Required!</title>', 'error code: 1015']
};

/**
 * Challenge Solver class.
 *
 * Handles the complete flow of:
 * 1. Navigating to the URL
 * 2. Detecting the challenge type
 * 3. Waiting for/solving the challenge
 * 4. Extracting cookies
 */
export class ChallengeSolver {
	private cookieExtractor: CookieExtractor;
	private turnstileSolver: TurnstileSolver;

	constructor() {
		this.cookieExtractor = new CookieExtractor();
		this.turnstileSolver = new TurnstileSolver();
	}

	/**
	 * Solve a Cloudflare challenge on the given page.
	 */
	async solve(page: Page, options: SolveOptions): Promise<SolveResult> {
		const startTime = Date.now();
		const timeout = options.timeout ?? 60000;

		log.info('Starting challenge solve', {
			url: options.url,
			timeout,
			indexerId: options.indexerId
		});

		try {
			// Navigate to the URL
			await this.navigateWithRetry(page, options.url, timeout);

			// Detect challenge type
			const challengeType = await this.detectChallengeType(page);
			log.debug('Detected challenge type', { challengeType });

			// Handle based on challenge type
			let success = false;

			switch (challengeType) {
				case 'turnstile':
					success = await this.solveTurnstileChallenge(page, timeout);
					break;

				case 'js-challenge':
					success = await this.solveJsChallenge(page, timeout);
					break;

				case 'managed':
					success = await this.solveManagedChallenge(page, timeout);
					break;

				case 'unknown':
					// Might already be solved or no challenge
					success = await this.checkAlreadySolved(page);
					if (!success) {
						// Wait a bit in case there's a delayed challenge
						await page.waitForTimeout(3000);
						success = await this.checkAlreadySolved(page);
					}
					break;
			}

			// Extract cookies
			const { cookies, expirations, hasClearance } = await this.cookieExtractor.extract(page);

			// If we have cf_clearance, consider it a success
			if (hasClearance) {
				success = true;
			}

			const solveTimeMs = Date.now() - startTime;

			if (success) {
				log.info('Challenge solved', {
					challengeType,
					solveTimeMs,
					hasClearance,
					cookieCount: Object.keys(cookies).length
				});

				return {
					success: true,
					cookies,
					expirations,
					content: await page.content(),
					finalUrl: page.url(),
					solveTimeMs,
					challengeType
				};
			}

			return {
				success: false,
				cookies,
				expirations,
				error: 'Failed to solve challenge',
				solveTimeMs,
				challengeType
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const solveTimeMs = Date.now() - startTime;

			log.error('Challenge solve failed', error, {
				url: options.url,
				solveTimeMs
			});

			return {
				success: false,
				cookies: {},
				expirations: {},
				error: message,
				solveTimeMs
			};
		}
	}

	/**
	 * Navigate to URL with retry logic for transient failures.
	 */
	private async navigateWithRetry(page: Page, url: string, timeout: number): Promise<void> {
		const maxRetries = 2;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				await page.goto(url, {
					waitUntil: 'domcontentloaded',
					timeout: Math.min(timeout / 2, 30000)
				});
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < maxRetries) {
					log.warn('Navigation failed, retrying', {
						attempt: attempt + 1,
						error: lastError.message
					});
					await page.waitForTimeout(1000);
				}
			}
		}

		throw lastError ?? new Error('Navigation failed');
	}

	/**
	 * Detect the type of Cloudflare challenge present on the page.
	 */
	async detectChallengeType(page: Page): Promise<ChallengeType> {
		const content = await page.content();

		// Check for Turnstile first (specific widget)
		if (CHALLENGE_PATTERNS.turnstile.some((p) => content.includes(p))) {
			return 'turnstile';
		}

		// Check for managed challenge
		if (CHALLENGE_PATTERNS.managed.some((p) => content.includes(p))) {
			return 'managed';
		}

		// Check for JS challenge
		if (CHALLENGE_PATTERNS.jsChallenge.some((p) => content.includes(p))) {
			return 'js-challenge';
		}

		// Check for access denied (not a challenge, just blocked)
		if (CHALLENGE_PATTERNS.accessDenied.some((p) => content.includes(p))) {
			log.warn('Access denied detected - site may be blocking this request');
			return 'unknown';
		}

		return 'unknown';
	}

	/**
	 * Solve a Turnstile challenge.
	 */
	private async solveTurnstileChallenge(page: Page, timeout: number): Promise<boolean> {
		log.debug('Solving Turnstile challenge');

		const result = await this.turnstileSolver.solve(page, timeout);

		if (result.solved) {
			// Wait for page to process the token
			await this.waitForChallengeCompletion(page, timeout / 2);
			return true;
		}

		return false;
	}

	/**
	 * Solve a JavaScript challenge (automatic, just wait).
	 */
	private async solveJsChallenge(page: Page, timeout: number): Promise<boolean> {
		log.debug('Waiting for JS challenge to auto-solve');

		// JS challenges typically auto-solve after evaluation
		// We just need to wait for cf_clearance cookie
		return await this.waitForChallengeCompletion(page, timeout);
	}

	/**
	 * Solve a managed challenge.
	 */
	private async solveManagedChallenge(page: Page, timeout: number): Promise<boolean> {
		log.debug('Attempting managed challenge');

		// Managed challenges may have Turnstile or just require waiting
		const hasTurnstile = await this.turnstileSolver.hasTurnstile(page);

		if (hasTurnstile) {
			const result = await this.turnstileSolver.solve(page, timeout);
			if (result.solved) {
				await this.waitForChallengeCompletion(page, timeout / 2);
				return true;
			}
		}

		// Fall back to waiting
		return await this.waitForChallengeCompletion(page, timeout);
	}

	/**
	 * Wait for the challenge to complete (cf_clearance cookie appears).
	 */
	private async waitForChallengeCompletion(page: Page, timeout: number): Promise<boolean> {
		const startTime = Date.now();

		log.debug('Waiting for challenge completion', { timeout });

		while (Date.now() - startTime < timeout) {
			// Check for cf_clearance cookie
			if (await this.cookieExtractor.hasClearanceCookie(page)) {
				log.debug('cf_clearance cookie detected');
				return true;
			}

			// Check if page no longer has challenge patterns
			const challengeType = await this.detectChallengeType(page);
			if (challengeType === 'unknown') {
				// Challenge might be solved, verify with cookie
				await page.waitForTimeout(1000);
				if (await this.cookieExtractor.hasClearanceCookie(page)) {
					return true;
				}
				// Give it more time - page might still be loading
				if (Date.now() - startTime > 5000) {
					// If no more challenge patterns and some time has passed, assume success
					return true;
				}
			}

			// Wait before checking again
			await page.waitForTimeout(500);
		}

		// Final check
		return await this.cookieExtractor.hasClearanceCookie(page);
	}

	/**
	 * Check if the page is already past the challenge.
	 */
	private async checkAlreadySolved(page: Page): Promise<boolean> {
		// Check for cf_clearance cookie
		if (await this.cookieExtractor.hasClearanceCookie(page)) {
			return true;
		}

		// Check if page content looks like actual site (not challenge page)
		const content = await page.content();

		// If none of the challenge patterns are present, might be solved
		const hasChallenge =
			CHALLENGE_PATTERNS.jsChallenge.some((p) => content.includes(p)) ||
			CHALLENGE_PATTERNS.turnstile.some((p) => content.includes(p)) ||
			CHALLENGE_PATTERNS.managed.some((p) => content.includes(p));

		return !hasChallenge;
	}
}
