/**
 * Streaming Provider Live Test Script
 *
 * Tests all streaming providers against live content with HLS validation.
 *
 * Usage:
 *   npx tsx scripts/test-streaming-providers.ts                     # Test all
 *   npx tsx scripts/test-streaming-providers.ts --provider videasy  # Single provider
 *   npx tsx scripts/test-streaming-providers.ts --type movie        # Single type
 *   npx tsx scripts/test-streaming-providers.ts --expected-down none # Override defaults
 */

import { parseArgs } from 'node:util';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_EXPECTED_DOWN = ['mapple', 'xprime', 'onetouchtv', 'smashy'];

const EXTRACTION_TIMEOUT_MS = 60000;
const VALIDATION_TIMEOUT_MS = 10000;

const TEST_CONTENT = {
	movie: {
		tmdbId: '27205',
		title: 'Inception',
		year: 2010,
		imdbId: 'tt1375666',
		type: 'movie' as const
	},
	tv: {
		tmdbId: '58474',
		title: 'Cosmos: A Spacetime Odyssey',
		season: 1,
		episode: 1,
		imdbId: 'tt2395695',
		type: 'tv' as const
	},
	anime: {
		tmdbId: '1429',
		title: 'Attack on Titan',
		season: 1,
		episode: 1,
		malId: 16498,
		anilistId: 16498,
		type: 'tv' as const
	},
	asiandrama: {
		tmdbId: '93405',
		title: 'Squid Game',
		season: 1,
		episode: 1,
		imdbId: 'tt10919420',
		type: 'tv' as const
	}
};

// ============================================================================
// Types
// ============================================================================

interface StreamTestResult {
	url: string;
	quality: string;
	server?: string;
	language?: string;
	referer: string;
	hlsValid: boolean;
	hlsType?: string;
	hlsVariants?: number;
	hlsError?: string;
}

interface ProviderTestResult {
	provider: string;
	contentType: 'movie' | 'tv' | 'anime' | 'asiandrama';
	success: boolean;
	streams: StreamTestResult[];
	error?: string;
	durationMs: number;
	skipped?: boolean;
	expectedDown?: boolean;
}

interface TestSummary {
	provider: string;
	movie: 'PASS' | 'FAIL' | 'SKIP' | '-';
	tv: 'PASS' | 'FAIL' | 'SKIP' | '-';
	anime: 'PASS' | 'FAIL' | 'SKIP' | '-';
	asiandrama: 'PASS' | 'FAIL' | 'SKIP' | '-';
	status: 'OK' | 'EXPECTED' | 'FAIL';
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseCliArgs() {
	const { values } = parseArgs({
		options: {
			provider: { type: 'string', short: 'p' },
			type: { type: 'string', short: 't' },
			'expected-down': { type: 'string', short: 'e' },
			help: { type: 'boolean', short: 'h' }
		},
		allowPositionals: false
	});

	if (values.help) {
		console.log(`
Streaming Provider Live Test Script

Usage:
  npx tsx scripts/test-streaming-providers.ts [options]

Options:
  -p, --provider <id>       Test specific provider only
  -t, --type <type>         Test specific content type (movie, tv, anime)
  -e, --expected-down <ids> Comma-separated list of expected-down providers
                            Use 'none' to expect all to work
  -h, --help                Show this help

Examples:
  npx tsx scripts/test-streaming-providers.ts
  npx tsx scripts/test-streaming-providers.ts --provider videasy
  npx tsx scripts/test-streaming-providers.ts --type anime
  npx tsx scripts/test-streaming-providers.ts --expected-down mapple,xprime
`);
		process.exit(0);
	}

	let expectedDown = DEFAULT_EXPECTED_DOWN;
	if (values['expected-down']) {
		if (values['expected-down'] === 'none') {
			expectedDown = [];
		} else {
			expectedDown = values['expected-down'].split(',').map((s) => s.trim().toLowerCase());
		}
	}

	const contentTypes: Array<'movie' | 'tv' | 'anime' | 'asiandrama'> = [];
	if (values.type) {
		const type = values.type.toLowerCase();
		if (type === 'movie' || type === 'tv' || type === 'anime' || type === 'asiandrama') {
			contentTypes.push(type);
		} else {
			console.error(`Invalid type: ${values.type}. Must be movie, tv, anime, or asiandrama.`);
			process.exit(1);
		}
	} else {
		contentTypes.push('movie', 'tv', 'anime', 'asiandrama');
	}

	return {
		provider: values.provider?.toLowerCase(),
		contentTypes,
		expectedDown
	};
}

// ============================================================================
// HLS Validation (simplified, no SvelteKit deps)
// ============================================================================

async function validateHlsPlaylist(
	url: string,
	referer: string
): Promise<{ valid: boolean; type?: string; variants?: number; error?: string }> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
				Referer: referer
				// Note: Don't send Origin header - some CDNs reject it
			}
		});

		if (!response.ok) {
			clearTimeout(timeout);
			return { valid: false, error: `HTTP ${response.status}` };
		}

		// Check content-type to avoid downloading huge MP4 files
		const contentType = response.headers.get('content-type') || '';
		if (
			contentType.includes('video/mp4') ||
			contentType.includes('application/octet-stream') ||
			contentType.includes('video/x-')
		) {
			clearTimeout(timeout);
			// It's a direct video file, not an HLS playlist - still valid as a stream
			return { valid: true, type: 'mp4' };
		}

		// Read only first 10KB to check if it's HLS
		const reader = response.body?.getReader();
		if (!reader) {
			clearTimeout(timeout);
			return { valid: false, error: 'No response body' };
		}

		let content = '';
		const decoder = new TextDecoder();
		const maxBytes = 10 * 1024; // 10KB should be enough to detect HLS

		try {
			while (content.length < maxBytes) {
				const { done, value } = await reader.read();
				if (done) break;
				content += decoder.decode(value, { stream: true });
			}
		} finally {
			reader.cancel().catch(() => {}); // Cancel the rest of the stream
			clearTimeout(timeout);
		}

		if (!content.includes('#EXTM3U')) {
			// Check if it looks like binary data (video file)
			if (content.charCodeAt(0) === 0 || content.includes('\x00')) {
				return { valid: true, type: 'mp4' };
			}
			return { valid: false, error: 'Not a valid HLS playlist' };
		}

		const isMaster =
			content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-I-FRAME-STREAM-INF');
		const type = isMaster ? 'master' : 'media';

		let variants: number | undefined;
		if (isMaster) {
			variants = (content.match(/#EXT-X-STREAM-INF/g) || []).length;
		}

		return { valid: true, type, variants };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('aborted') || message.includes('abort')) {
			return { valid: false, error: 'Timeout' };
		}
		return { valid: false, error: message };
	}
}

// ============================================================================
// Provider Testing
// ============================================================================

async function testProvider(
	provider: Awaited<
		ReturnType<typeof import('../src/lib/server/streaming/providers').getAvailableProviders>
	>[0],
	contentType: 'movie' | 'tv' | 'anime' | 'asiandrama',
	expectedDown: string[]
): Promise<ProviderTestResult> {
	const config = provider.config;
	const isExpectedDown = expectedDown.includes(config.id);

	// Check if provider supports this content type
	const supportsType =
		(contentType === 'movie' && config.supportsMovies) ||
		(contentType === 'tv' && config.supportsTv) ||
		(contentType === 'anime' && config.supportsAnime) ||
		(contentType === 'asiandrama' && config.supportsAsianDrama);

	if (!supportsType) {
		return {
			provider: config.id,
			contentType,
			success: false,
			streams: [],
			skipped: true,
			durationMs: 0
		};
	}

	const content = TEST_CONTENT[contentType];

	console.log('');
	console.log('='.repeat(70));
	console.log(`Testing: ${config.name} (${config.id})`);
	console.log(
		`Content: ${content.title}${content.type === 'tv' ? ` S${(content as typeof TEST_CONTENT.tv).season}E${(content as typeof TEST_CONTENT.tv).episode}` : ''} [${contentType.toUpperCase()}]`
	);
	if (isExpectedDown) {
		console.log(`Status: EXPECTED DOWN`);
	}
	console.log('='.repeat(70));

	const startTime = Date.now();

	try {
		// Build extraction params
		const params: Parameters<typeof provider.extract>[0] = {
			tmdbId: content.tmdbId,
			type: content.type,
			title: content.title,
			year: content.type === 'movie' ? (content as typeof TEST_CONTENT.movie).year : undefined,
			imdbId: 'imdbId' in content ? content.imdbId : undefined,
			season: content.type === 'tv' ? (content as typeof TEST_CONTENT.tv).season : undefined,
			episode: content.type === 'tv' ? (content as typeof TEST_CONTENT.tv).episode : undefined,
			malId: 'malId' in content ? content.malId : undefined,
			anilistId: 'anilistId' in content ? content.anilistId : undefined
		};

		// Extract with timeout
		const extractPromise = provider.extract(params);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Extraction timeout')), EXTRACTION_TIMEOUT_MS)
		);

		const result = await Promise.race([extractPromise, timeoutPromise]);
		const durationMs = Date.now() - startTime;

		console.log(`\nExtraction completed in ${durationMs}ms`);

		if (!result.success || !result.streams || result.streams.length === 0) {
			console.log(`Result: FAIL - ${result.error || 'No streams returned'}`);
			return {
				provider: config.id,
				contentType,
				success: false,
				streams: [],
				error: result.error || 'No streams returned',
				durationMs,
				expectedDown: isExpectedDown
			};
		}

		console.log(`Found ${result.streams.length} stream(s):\n`);

		const streamResults: StreamTestResult[] = [];

		for (let i = 0; i < result.streams.length; i++) {
			const stream = result.streams[i];
			console.log(
				`[${i + 1}] ${stream.quality || 'Auto'} - ${stream.server || stream.title || 'Unknown'}`
			);
			console.log(`    URL: ${stream.url.substring(0, 80)}${stream.url.length > 80 ? '...' : ''}`);
			console.log(`    Referer: ${stream.referer}`);
			if (stream.language) {
				console.log(`    Language: ${stream.language}`);
			}

			// Validate HLS
			const hlsResult = await validateHlsPlaylist(stream.url, stream.referer);
			if (hlsResult.valid) {
				console.log(
					`    HLS: PASS (${hlsResult.type}${hlsResult.variants ? `, ${hlsResult.variants} variants` : ''})`
				);
			} else {
				console.log(`    HLS: FAIL (${hlsResult.error})`);
			}

			// Print mpv command
			console.log(`    mpv: mpv "${stream.url}" --referrer="${stream.referer}"`);
			console.log('');

			streamResults.push({
				url: stream.url,
				quality: stream.quality || 'Auto',
				server: stream.server,
				language: stream.language,
				referer: stream.referer,
				hlsValid: hlsResult.valid,
				hlsType: hlsResult.type,
				hlsVariants: hlsResult.variants,
				hlsError: hlsResult.error
			});
		}

		const validStreams = streamResults.filter((s) => s.hlsValid).length;
		const success = validStreams > 0;

		console.log(
			`Result: ${success ? 'PASS' : 'FAIL'} (${result.streams.length} streams, ${validStreams} validated)`
		);

		return {
			provider: config.id,
			contentType,
			success,
			streams: streamResults,
			durationMs,
			expectedDown: isExpectedDown
		};
	} catch (error) {
		const durationMs = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log(`\nResult: FAIL - ${errorMessage}`);

		return {
			provider: config.id,
			contentType,
			success: false,
			streams: [],
			error: errorMessage,
			durationMs,
			expectedDown: isExpectedDown
		};
	}
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	const args = parseCliArgs();

	console.log('');
	console.log('#'.repeat(70));
	console.log('# Streaming Provider Live Test');
	console.log('#'.repeat(70));
	console.log(`# Content Types: ${args.contentTypes.join(', ')}`);
	console.log(`# Provider Filter: ${args.provider || 'all'}`);
	console.log(
		`# Expected Down: ${args.expectedDown.length > 0 ? args.expectedDown.join(', ') : 'none'}`
	);
	console.log('#'.repeat(70));

	// Import providers
	const { getAvailableProviders, clearCaches } =
		await import('../src/lib/server/streaming/providers');

	clearCaches();

	let providers = getAvailableProviders();

	// Filter by specific provider if requested
	if (args.provider) {
		providers = providers.filter((p) => p.config.id === args.provider);
		if (providers.length === 0) {
			console.error(`\nProvider '${args.provider}' not found.`);
			console.log('Available providers:');
			getAvailableProviders().forEach((p) => console.log(`  - ${p.config.id}`));
			process.exit(1);
		}
	}

	// Run tests
	const allResults: ProviderTestResult[] = [];

	for (const provider of providers) {
		for (const contentType of args.contentTypes) {
			const result = await testProvider(provider, contentType, args.expectedDown);
			allResults.push(result);
		}
	}

	// Build summary
	const summaries = new Map<string, TestSummary>();

	for (const provider of providers) {
		summaries.set(provider.config.id, {
			provider: provider.config.id,
			movie: '-',
			tv: '-',
			anime: '-',
			asiandrama: '-',
			status: 'OK'
		});
	}

	for (const result of allResults) {
		const summary = summaries.get(result.provider)!;

		let status: 'PASS' | 'FAIL' | 'SKIP' | '-';
		if (result.skipped) {
			status = '-';
		} else if (result.success) {
			status = 'PASS';
		} else {
			status = 'FAIL';
		}

		if (result.contentType === 'movie') {
			summary.movie = status;
		} else if (result.contentType === 'tv') {
			summary.tv = status;
		} else if (result.contentType === 'anime') {
			summary.anime = status;
		} else if (result.contentType === 'asiandrama') {
			summary.asiandrama = status;
		}

		// Update overall status
		if (!result.skipped && !result.success) {
			if (result.expectedDown) {
				summary.status = 'EXPECTED';
			} else if (summary.status !== 'EXPECTED') {
				summary.status = 'FAIL';
			}
		}
	}

	// Print summary
	console.log('\n');
	console.log('='.repeat(80));
	console.log('SUMMARY');
	console.log('='.repeat(80));
	console.log('');
	console.log(
		'Provider'.padEnd(15) +
			'| Movie'.padEnd(8) +
			'| TV'.padEnd(8) +
			'| Anime'.padEnd(8) +
			'| KDrama'.padEnd(9) +
			'| Status'
	);
	console.log(
		'-'.repeat(15) +
			'|' +
			'-'.repeat(7) +
			'|' +
			'-'.repeat(7) +
			'|' +
			'-'.repeat(7) +
			'|' +
			'-'.repeat(8) +
			'|' +
			'-'.repeat(15)
	);

	for (const summary of summaries.values()) {
		const statusText =
			summary.status === 'EXPECTED' ? 'EXPECTED (down)' : summary.status === 'FAIL' ? 'FAIL' : 'OK';
		console.log(
			summary.provider.padEnd(15) +
				`| ${summary.movie}`.padEnd(8) +
				`| ${summary.tv}`.padEnd(8) +
				`| ${summary.anime}`.padEnd(8) +
				`| ${summary.asiandrama}`.padEnd(9) +
				`| ${statusText}`
		);
	}

	// Calculate pass rate
	const testedResults = allResults.filter((r) => !r.skipped);
	const passedResults = testedResults.filter((r) => r.success);
	const expectedFailures = testedResults.filter((r) => !r.success && r.expectedDown);
	const unexpectedFailures = testedResults.filter((r) => !r.success && !r.expectedDown);

	console.log('');
	console.log(
		`Passed: ${passedResults.length}/${testedResults.length - expectedFailures.length}` +
			(expectedFailures.length > 0 ? ` (${expectedFailures.length} expected failures)` : '')
	);

	if (unexpectedFailures.length > 0) {
		console.log(`\nUnexpected failures:`);
		for (const result of unexpectedFailures) {
			console.log(`  - ${result.provider} (${result.contentType}): ${result.error}`);
		}
	}

	console.log('');

	// Exit with error code if unexpected failures
	process.exit(unexpectedFailures.length > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
