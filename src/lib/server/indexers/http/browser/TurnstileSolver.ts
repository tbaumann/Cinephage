/**
 * Turnstile Solver
 *
 * Handles Cloudflare Turnstile widget challenges. Turnstile is
 * Cloudflare's CAPTCHA-free alternative that uses behavioral
 * analysis and a checkbox widget.
 */

import type { Page, Frame } from 'playwright';
import { createChildLogger } from '$lib/logging';

const log = createChildLogger({ module: 'TurnstileSolver' });

/**
 * Selectors for detecting and interacting with Turnstile widgets.
 */
const TURNSTILE_SELECTORS = {
	// Turnstile iframe
	iframe: 'iframe[src*="challenges.cloudflare.com/turnstile"]',
	// Alternative iframe selector
	iframeAlt: 'iframe[src*="cloudflare.com/cdn-cgi/challenge-platform"]',
	// Widget container
	container: '.cf-turnstile',
	// Response input (contains token when solved)
	responseInput: '[name="cf-turnstile-response"]',
	// Alternative response input
	responseInputAlt: 'input[name="cf-turnstile-response"]'
};

/**
 * Result of a Turnstile solve attempt.
 */
export interface TurnstileSolveResult {
	/** Whether the Turnstile was solved */
	solved: boolean;
	/** The response token if solved */
	token?: string;
	/** Error message if solving failed */
	error?: string;
}

/**
 * Turnstile Solver class.
 *
 * Handles solving Cloudflare Turnstile challenges by:
 * 1. Detecting the Turnstile iframe
 * 2. Interacting with the checkbox if visible
 * 3. Waiting for the response token
 */
export class TurnstileSolver {
	/**
	 * Attempt to solve a Turnstile challenge on the page.
	 */
	async solve(page: Page, timeout: number): Promise<TurnstileSolveResult> {
		log.debug('Attempting to solve Turnstile challenge');

		try {
			// First, check if there's already a response (auto-solved)
			const existingToken = await this.getResponseToken(page);
			if (existingToken) {
				log.debug('Turnstile already solved (auto-pass)');
				return { solved: true, token: existingToken };
			}

			// Wait for Turnstile iframe to appear
			const iframe = await this.waitForTurnstileIframe(page, timeout);
			if (!iframe) {
				// No iframe found - might be auto-solving in background
				// Wait a bit and check for response
				await page.waitForTimeout(3000);
				const token = await this.getResponseToken(page);
				if (token) {
					log.debug('Turnstile solved without interaction');
					return { solved: true, token };
				}
				return { solved: false, error: 'No Turnstile iframe found' };
			}

			// Get the iframe's content frame
			const frame = await iframe.contentFrame();
			if (!frame) {
				log.warn('Could not access Turnstile iframe content');
				// Try waiting for auto-solve
				await page.waitForTimeout(5000);
				const token = await this.getResponseToken(page);
				if (token) {
					return { solved: true, token };
				}
				return { solved: false, error: 'Could not access Turnstile iframe' };
			}

			// Try to interact with the checkbox
			const clicked = await this.clickCheckbox(frame);
			if (clicked) {
				log.debug('Clicked Turnstile checkbox');
			}

			// Wait for the response token
			const token = await this.waitForResponseToken(page, timeout);
			if (token) {
				log.info('Turnstile solved successfully');
				return { solved: true, token };
			}

			return { solved: false, error: 'Timed out waiting for Turnstile response' };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error('Turnstile solve failed', error);
			return { solved: false, error: message };
		}
	}

	/**
	 * Check if the page has a Turnstile challenge.
	 */
	async hasTurnstile(page: Page): Promise<boolean> {
		const content = await page.content();

		// Check for Turnstile markers in HTML
		if (
			content.includes('cf-turnstile') ||
			content.includes('challenges.cloudflare.com/turnstile')
		) {
			return true;
		}

		// Check for Turnstile iframe
		const iframe = await page.$(TURNSTILE_SELECTORS.iframe);
		if (iframe) return true;

		const iframeAlt = await page.$(TURNSTILE_SELECTORS.iframeAlt);
		if (iframeAlt) return true;

		// Check for widget container
		const container = await page.$(TURNSTILE_SELECTORS.container);
		if (container) return true;

		return false;
	}

	/**
	 * Wait for the Turnstile iframe to appear.
	 */
	private async waitForTurnstileIframe(page: Page, timeout: number) {
		try {
			// Try primary selector first
			const iframe = await page.waitForSelector(TURNSTILE_SELECTORS.iframe, {
				timeout: Math.min(timeout, 10000),
				state: 'attached'
			});
			return iframe;
		} catch {
			// Try alternative selector
			try {
				const iframeAlt = await page.waitForSelector(TURNSTILE_SELECTORS.iframeAlt, {
					timeout: 5000,
					state: 'attached'
				});
				return iframeAlt;
			} catch {
				return null;
			}
		}
	}

	/**
	 * Try to click the Turnstile checkbox.
	 */
	private async clickCheckbox(frame: Frame): Promise<boolean> {
		try {
			// Wait for checkbox to be visible
			const checkbox = await frame.waitForSelector('input[type="checkbox"]', {
				timeout: 5000,
				state: 'visible'
			});

			if (checkbox) {
				// Move mouse to checkbox (more human-like)
				const box = await checkbox.boundingBox();
				if (box) {
					await frame.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
						steps: 10
					});
					await frame.page().waitForTimeout(100 + Math.random() * 200);
				}

				await checkbox.click();
				return true;
			}
		} catch {
			// Checkbox might not be present or clickable
			log.debug('No clickable checkbox found in Turnstile');
		}

		// Try clicking the body of the iframe (some Turnstile versions)
		try {
			await frame.click('body', { timeout: 2000 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the Turnstile response token if available.
	 */
	private async getResponseToken(page: Page): Promise<string | null> {
		try {
			// Check the response input field
			const input = await page.$(TURNSTILE_SELECTORS.responseInput);
			if (input) {
				const value = await input.getAttribute('value');
				if (value && value.length > 0) {
					return value;
				}
			}

			// Check alternative input
			const inputAlt = await page.$(TURNSTILE_SELECTORS.responseInputAlt);
			if (inputAlt) {
				const value = await inputAlt.getAttribute('value');
				if (value && value.length > 0) {
					return value;
				}
			}

			// Try evaluating in page context
			const token = await page.evaluate(() => {
				const input = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement;
				return input?.value || null;
			});

			return token;
		} catch {
			return null;
		}
	}

	/**
	 * Wait for the response token to appear.
	 */
	private async waitForResponseToken(page: Page, timeout: number): Promise<string | null> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeout) {
			const token = await this.getResponseToken(page);
			if (token) {
				return token;
			}

			// Wait a bit before checking again
			await page.waitForTimeout(500);
		}

		return null;
	}
}
