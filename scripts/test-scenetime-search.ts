/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * SceneTime Search & Parsing Test
 *
 * Comprehensive test of SceneTime search functionality:
 * - Category filtering (Movies HD, TV HD, etc.)
 * - Field extraction (title, size, seeders, leechers, date)
 * - IMDB ID extraction
 * - Freeleech detection
 *
 * Usage: npx tsx scripts/test-scenetime-search.ts
 */

import 'dotenv/config';
import * as cheerio from 'cheerio';

const SCENETIME_URL = 'https://www.scenetime.com';
const BROWSE_URL = `${SCENETIME_URL}/browse.php`;

// SceneTime category IDs (from YAML definition)
const CATEGORIES = {
	// Movies
	'Movies UHD': 16,
	'Movies HD': 59,
	'Movies SD': 57,
	'Movies 3D': 64,
	'Movies CAM/TS': 82,
	'Movie Packs': 47,
	// TV
	'TV UHD': 2,
	'TV HD': 9,
	'TV SD': 77,
	'TV Packs': 43,
	'TV Anime': 1
};

interface ParsedRelease {
	title: string;
	detailsUrl: string;
	downloadUrl: string;
	size: string;
	seeders: number;
	leechers: number;
	date: string;
	category: string;
	categoryId: string;
	isFreeleech: boolean;
	imdbId?: string;
}

function getCookieHeader(): string {
	const cookieStr = process.env.SCENETIME_COOKIE;
	if (!cookieStr) {
		throw new Error('SCENETIME_COOKIE not set in .env');
	}
	return cookieStr;
}

async function fetchPage(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			Cookie: getCookieHeader(),
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		}
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	return response.text();
}

function parseResults(html: string): ParsedRelease[] {
	const $ = cheerio.load(html);
	const releases: ParsedRelease[] = [];

	// Try multiple selectors to find result rows
	// Current YAML uses: table.movehere > tbody > tr:has(a[href*="details.php"])
	let rows = $('table.movehere > tbody > tr:has(a[href*="details.php"])');

	if (rows.length === 0) {
		// Try alternative: tr.browse (what Prowlarr uses)
		rows = $('tr.browse');
	}

	if (rows.length === 0) {
		// Try even more generic
		rows = $('tr:has(a[href*="details.php"])');
	}

	console.log(`  Found ${rows.length} result rows`);

	rows.each((i, row) => {
		try {
			const $row = $(row);
			const cells = $row.find('td');

			// Debug: Print cell count
			if (i === 0) {
				console.log(`  Row has ${cells.length} cells`);
			}

			// Extract fields - try both YAML selectors and Prowlarr's dynamic approach

			// Title - from details link
			const detailsLink = $row.find('a[href*="details.php"]').first();
			let title = detailsLink.text().trim();
			// Clean up title - remove font tags content
			title = title.replace(/<\/?font[^>]*>/g, '').trim();

			const detailsUrl = detailsLink.attr('href') || '';

			// Download URL
			const downloadLink = $row.find('a[href*="download.php"]').first();
			const downloadUrl = downloadLink.attr('href') || '';

			// Category - from cat link
			const catLink = $row.find('a[href*="cat="]').first();
			const catHref = catLink.attr('href') || '';
			const catMatch = catHref.match(/cat=(\d+)/);
			const categoryId = catMatch ? catMatch[1] : '';
			const category = catLink.find('img').attr('alt') || catLink.text().trim() || categoryId;

			// Size - typically in a specific column
			// Try to find by looking for size patterns
			let size = '';
			cells.each((_, cell) => {
				const text = $(cell).text().trim();
				if (/^\d+(\.\d+)?\s*(GB|MB|KB|TB)/i.test(text)) {
					size = text;
				}
			});

			// Seeders/Leechers - look for columns with just numbers
			let seeders = 0;
			let leechers = 0;
			const numberCells: number[] = [];
			cells.each((_, cell) => {
				const text = $(cell).text().trim();
				if (/^\d+$/.test(text)) {
					numberCells.push(parseInt(text, 10));
				}
			});
			// Usually seeders and leechers are the last two number-only columns
			if (numberCells.length >= 2) {
				seeders = numberCells[numberCells.length - 2] || 0;
				leechers = numberCells[numberCells.length - 1] || 0;
			}

			// Date - from span with title attribute or elapsedDate class
			const dateSpan = $row.find('span[title], span.elapsedDate').first();
			const date = dateSpan.attr('title') || dateSpan.text().trim() || '';

			// Freeleech detection
			const isFreeleech =
				$row.find('font > b:contains("Freeleech")').length > 0 ||
				$row.find('.freeleech').length > 0 ||
				$row.text().toLowerCase().includes('freeleech');

			// IMDB ID
			const imdbLink = $row.find('a[href*="imdb.com/title/tt"]').first();
			const imdbHref = imdbLink.attr('href') || '';
			const imdbMatch = imdbHref.match(/tt(\d+)/);
			const imdbId = imdbMatch ? `tt${imdbMatch[1]}` : undefined;

			if (title && detailsUrl) {
				releases.push({
					title,
					detailsUrl: detailsUrl.startsWith('http') ? detailsUrl : `${SCENETIME_URL}/${detailsUrl}`,
					downloadUrl: downloadUrl.startsWith('http')
						? downloadUrl
						: `${SCENETIME_URL}/${downloadUrl}`,
					size,
					seeders,
					leechers,
					date,
					category,
					categoryId,
					isFreeleech,
					imdbId
				});
			}
		} catch (err) {
			// Skip malformed rows
		}
	});

	return releases;
}

async function testSearch(name: string, params: Record<string, string>): Promise<ParsedRelease[]> {
	const searchParams = new URLSearchParams({
		cata: 'yes',
		...params
	});

	const url = `${BROWSE_URL}?${searchParams.toString()}`;
	console.log(`\n${name}`);
	console.log(`  URL: ${url}`);

	try {
		const html = await fetchPage(url);
		const releases = parseResults(html);

		console.log(`  Results: ${releases.length}`);

		if (releases.length > 0) {
			console.log(`\n  Sample results:`);
			for (const r of releases.slice(0, 3)) {
				console.log(`    - ${r.title.substring(0, 60)}${r.title.length > 60 ? '...' : ''}`);
				console.log(
					`      Size: ${r.size || 'N/A'} | S: ${r.seeders} | L: ${r.leechers} | Cat: ${r.categoryId}`
				);
				if (r.imdbId) console.log(`      IMDB: ${r.imdbId}`);
				if (r.isFreeleech) console.log(`      🆓 FREELEECH`);
			}
		}

		return releases;
	} catch (error) {
		console.log(`  ERROR: ${error instanceof Error ? error.message : error}`);
		return [];
	}
}

async function main() {
	console.log('╔══════════════════════════════════════════════════════════════╗');
	console.log('║           SceneTime Search & Parsing Test                     ║');
	console.log('╚══════════════════════════════════════════════════════════════╝');

	// Check cookie
	if (!process.env.SCENETIME_COOKIE) {
		console.log('\n❌ SCENETIME_COOKIE not set in .env');
		process.exit(1);
	}

	// Test 1: General search
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 1: General Search');
	console.log('═'.repeat(60));
	await testSearch('Search for "Gladiator"', { search: 'Gladiator' });

	// Test 2: Movies HD category only
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 2: Movies HD Category');
	console.log('═'.repeat(60));
	await testSearch('Movies HD - "Gladiator"', {
		search: 'Gladiator',
		[`c${CATEGORIES['Movies HD']}`]: '1' // c59=1
	});

	// Test 3: TV HD category only
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 3: TV HD Category');
	console.log('═'.repeat(60));
	await testSearch('TV HD - "Penguin"', {
		search: 'Penguin',
		[`c${CATEGORIES['TV HD']}`]: '1' // c9=1
	});

	// Test 4: Multiple categories (Movies HD + Movies UHD)
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 4: Multiple Categories (Movies HD + UHD)');
	console.log('═'.repeat(60));
	await testSearch('Movies HD+UHD - "Dune"', {
		search: 'Dune',
		[`c${CATEGORIES['Movies HD']}`]: '1',
		[`c${CATEGORIES['Movies UHD']}`]: '1'
	});

	// Test 5: Browse without search (recent uploads)
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 5: Recent Uploads (no search term)');
	console.log('═'.repeat(60));
	await testSearch('Recent Movies HD', {
		[`c${CATEGORIES['Movies HD']}`]: '1'
	});

	// Test 6: IMDB search
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 6: IMDB Search');
	console.log('═'.repeat(60));
	// Gladiator 2 IMDB ID
	await testSearch('IMDB: tt9218128 (Gladiator 2)', {
		imdb: 'tt9218128',
		[`c${CATEGORIES['Movies HD']}`]: '1',
		[`c${CATEGORIES['Movies UHD']}`]: '1'
	});

	// Test 7: Freeleech filter
	console.log('\n' + '═'.repeat(60));
	console.log('TEST 7: Freeleech Only');
	console.log('═'.repeat(60));
	const freeleechResults = await testSearch('Freeleech Movies', {
		freeleech: 'on',
		[`c${CATEGORIES['Movies HD']}`]: '1'
	});

	// Summary
	console.log('\n' + '═'.repeat(60));
	console.log('PARSING ANALYSIS');
	console.log('═'.repeat(60));

	// Check field extraction quality
	if (freeleechResults.length > 0) {
		const sample = freeleechResults[0];
		console.log('\nField extraction check (first result):');
		console.log(
			`  Title:      ${sample.title ? '✓' : '✗'} ${sample.title?.substring(0, 40) || 'MISSING'}`
		);
		console.log(`  Size:       ${sample.size ? '✓' : '✗'} ${sample.size || 'MISSING'}`);
		console.log(`  Seeders:    ${sample.seeders > 0 ? '✓' : '?'} ${sample.seeders}`);
		console.log(`  Leechers:   ${sample.leechers >= 0 ? '✓' : '?'} ${sample.leechers}`);
		console.log(`  Category:   ${sample.categoryId ? '✓' : '✗'} ${sample.categoryId}`);
		console.log(
			`  Download:   ${sample.downloadUrl ? '✓' : '✗'} ${sample.downloadUrl ? 'present' : 'MISSING'}`
		);
		console.log(`  Date:       ${sample.date ? '✓' : '✗'} ${sample.date || 'MISSING'}`);
		console.log(`  Freeleech:  ${sample.isFreeleech ? '✓ Yes' : '✗ No'}`);
	}

	console.log('\nDone.');
}

main().catch((error) => {
	console.error('\nFatal error:', error);
	process.exit(1);
});
