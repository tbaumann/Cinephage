/**
 * Subtitle Proxy Endpoint
 *
 * Proxies VTT/SRT subtitle files with proper referer headers.
 * Required because:
 * - Subtitle URLs may require referer headers
 * - CORS restrictions prevent direct client access
 * - Auto-converts SRT to VTT format for HLS compatibility
 *
 * GET /api/streaming/subtitle?url=<encoded_url>&referer=<encoded_referer>
 */

import type { RequestHandler } from './$types';
import { logger } from '$lib/logging';
import { ensureVttFormat } from '$lib/server/streaming/utils';
import { PROXY_FETCH_TIMEOUT_MS } from '$lib/server/streaming/constants';

const streamLog = { logCategory: 'streams' as const };

// Maximum subtitle file size (2MB should be plenty for any subtitle file)
const MAX_SUBTITLE_SIZE = 2 * 1024 * 1024;

// Maximum redirects to follow
const MAX_REDIRECTS = 5;

// Allowed URL schemes
const ALLOWED_SCHEMES = ['http:', 'https:'];

// Private IP ranges that should be blocked (SSRF protection)
const PRIVATE_IP_PATTERNS = [
	/^127\./, // 127.0.0.0/8 (localhost)
	/^10\./, // 10.0.0.0/8 (private)
	/^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (private)
	/^192\.168\./, // 192.168.0.0/16 (private)
	/^169\.254\./, // 169.254.0.0/16 (link-local)
	/^0\./, // 0.0.0.0/8
	/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
	/^192\.0\.0\./, // 192.0.0.0/24 (IETF protocol assignments)
	/^192\.0\.2\./, // 192.0.2.0/24 (TEST-NET-1)
	/^198\.51\.100\./, // 198.51.100.0/24 (TEST-NET-2)
	/^203\.0\.113\./, // 203.0.113.0/24 (TEST-NET-3)
	/^::1$/, // IPv6 localhost
	/^fc00:/i, // IPv6 unique local
	/^fe80:/i // IPv6 link-local
];

const BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain', '[::1]', '0.0.0.0'];

/**
 * Validates that a URL is safe to proxy (not internal/private network)
 */
function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
	try {
		const url = new URL(urlString);

		if (!ALLOWED_SCHEMES.includes(url.protocol)) {
			return { safe: false, reason: `Invalid scheme: ${url.protocol}` };
		}

		const hostname = url.hostname.toLowerCase();
		if (BLOCKED_HOSTNAMES.includes(hostname)) {
			return { safe: false, reason: 'Blocked hostname' };
		}

		for (const pattern of PRIVATE_IP_PATTERNS) {
			if (pattern.test(hostname)) {
				return { safe: false, reason: 'Private/internal IP address' };
			}
		}

		if (hostname.startsWith('[') && hostname.includes('::1')) {
			return { safe: false, reason: 'IPv6 localhost' };
		}

		return { safe: true };
	} catch {
		return { safe: false, reason: 'Invalid URL format' };
	}
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), PROXY_FETCH_TIMEOUT_MS);

	try {
		return await fetch(url, {
			...options,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const subtitleUrl = url.searchParams.get('url');
	const referer = url.searchParams.get('referer') || '';

	if (!subtitleUrl) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const decodedUrl = decodeURIComponent(subtitleUrl);

	try {
		// SSRF protection
		const safetyCheck = isUrlSafe(decodedUrl);
		if (!safetyCheck.safe) {
			logger.warn('Blocked unsafe subtitle URL', {
				url: decodedUrl,
				reason: safetyCheck.reason,
				...streamLog
			});
			return new Response(
				JSON.stringify({ error: 'URL not allowed', reason: safetyCheck.reason }),
				{ status: 403, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const headers: HeadersInit = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			Accept: 'text/vtt, text/plain, */*'
		};

		if (referer) {
			headers['Referer'] = referer;
		}

		// Follow redirects with loop protection
		let currentUrl = decodedUrl;
		let redirectCount = 0;
		const visitedUrls = new Set<string>();
		let response: Response;

		while (true) {
			if (visitedUrls.has(currentUrl)) {
				return new Response(JSON.stringify({ error: 'Redirect loop detected' }), {
					status: 508,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			visitedUrls.add(currentUrl);

			if (redirectCount >= MAX_REDIRECTS) {
				return new Response(JSON.stringify({ error: 'Too many redirects' }), {
					status: 508,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			response = await fetchWithTimeout(currentUrl, {
				headers,
				redirect: 'manual'
			});

			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (location) {
					const redirectUrl = new URL(location, currentUrl).toString();
					const redirectSafetyCheck = isUrlSafe(redirectUrl);
					if (!redirectSafetyCheck.safe) {
						return new Response(
							JSON.stringify({
								error: 'Redirect target not allowed',
								reason: redirectSafetyCheck.reason
							}),
							{ status: 403, headers: { 'Content-Type': 'application/json' } }
						);
					}
					currentUrl = redirectUrl;
					redirectCount++;
					continue;
				}
			}

			break;
		}

		if (!response.ok) {
			logger.warn('Subtitle fetch failed', {
				url: decodedUrl.substring(0, 100),
				status: response.status,
				...streamLog
			});
			return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Check content length
		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			const size = parseInt(contentLength, 10);
			if (size > MAX_SUBTITLE_SIZE) {
				return new Response(
					JSON.stringify({
						error: 'Subtitle file too large',
						size,
						maxSize: MAX_SUBTITLE_SIZE
					}),
					{ status: 413, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		let content = await response.text();

		// Convert to VTT if needed (handles SRT and other formats)
		content = ensureVttFormat(content);

		logger.debug('Subtitle proxied successfully', {
			url: decodedUrl.substring(0, 100),
			originalSize: contentLength,
			finalSize: content.length,
			...streamLog
		});

		return new Response(content, {
			status: 200,
			headers: {
				'Content-Type': 'text/vtt; charset=utf-8',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes('abort')) {
			return new Response(JSON.stringify({ error: 'Subtitle fetch timeout' }), {
				status: 504,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		logger.error('Subtitle proxy error', error, { url: decodedUrl, ...streamLog });
		return new Response(JSON.stringify({ error: 'Subtitle proxy error', details: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};
