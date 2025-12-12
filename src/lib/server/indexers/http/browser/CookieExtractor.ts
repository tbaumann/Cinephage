/**
 * Cookie Extractor
 *
 * Extracts cookies from Playwright browser contexts, with special
 * handling for Cloudflare cookies like cf_clearance.
 */

import type { Page } from 'playwright';
import { createChildLogger } from '$lib/logging';

const log = createChildLogger({ module: 'CookieExtractor' });

/**
 * Extracted cookies with metadata.
 */
export interface ExtractedCookies {
	/** Cookie name-value pairs */
	cookies: Record<string, string>;
	/** Cookie expiration times */
	expirations: Record<string, Date>;
	/** Whether cf_clearance cookie is present */
	hasClearance: boolean;
}

/**
 * Cookie Extractor utility class.
 */
export class CookieExtractor {
	/**
	 * Extract all cookies from a page's browser context.
	 */
	async extract(page: Page): Promise<ExtractedCookies> {
		const context = page.context();
		const rawCookies = await context.cookies();

		const cookies: Record<string, string> = {};
		const expirations: Record<string, Date> = {};
		let hasClearance = false;

		for (const cookie of rawCookies) {
			cookies[cookie.name] = cookie.value;

			// Calculate expiration time
			if (cookie.expires && cookie.expires > 0) {
				// Playwright returns expires as seconds since epoch
				expirations[cookie.name] = new Date(cookie.expires * 1000);
			}

			// Check for cf_clearance
			if (cookie.name === 'cf_clearance') {
				hasClearance = true;
				log.debug('Found cf_clearance cookie', {
					expires: expirations[cookie.name]?.toISOString()
				});
			}
		}

		log.debug('Extracted cookies', {
			count: Object.keys(cookies).length,
			hasClearance,
			names: Object.keys(cookies)
		});

		return { cookies, expirations, hasClearance };
	}

	/**
	 * Extract cookies for a specific domain.
	 */
	async extractForDomain(page: Page, domain: string): Promise<ExtractedCookies> {
		const context = page.context();
		const rawCookies = await context.cookies();

		const cookies: Record<string, string> = {};
		const expirations: Record<string, Date> = {};
		let hasClearance = false;

		for (const cookie of rawCookies) {
			// Filter by domain (allow subdomains)
			const cookieDomain = cookie.domain.replace(/^\./, '');
			if (!domain.endsWith(cookieDomain) && cookieDomain !== domain) {
				continue;
			}

			cookies[cookie.name] = cookie.value;

			if (cookie.expires && cookie.expires > 0) {
				expirations[cookie.name] = new Date(cookie.expires * 1000);
			}

			if (cookie.name === 'cf_clearance') {
				hasClearance = true;
			}
		}

		return { cookies, expirations, hasClearance };
	}

	/**
	 * Check if cf_clearance cookie is present in the page.
	 */
	async hasClearanceCookie(page: Page): Promise<boolean> {
		const context = page.context();
		const cookies = await context.cookies();
		return cookies.some((c) => c.name === 'cf_clearance');
	}

	/**
	 * Get the cf_clearance cookie value if present.
	 */
	async getClearanceCookie(page: Page): Promise<string | null> {
		const context = page.context();
		const cookies = await context.cookies();
		const clearance = cookies.find((c) => c.name === 'cf_clearance');
		return clearance?.value ?? null;
	}

	/**
	 * Clear all cookies from the page context.
	 */
	async clearCookies(page: Page): Promise<void> {
		const context = page.context();
		await context.clearCookies();
	}
}
