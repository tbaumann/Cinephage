import { describe, it, expect } from 'vitest';
import { scoreRelease, isUpgrade } from './scorer';
import { DEFAULT_PROFILES } from './profiles';
import type { ScoringProfile } from './types';

// Profiles that support torrent-based release scoring (excludes streaming-only)
const TORRENT_PROFILES = DEFAULT_PROFILES.filter((p) => p.id !== 'streaming');

/**
 * Comprehensive tests for the scoring/upgrade system.
 * Tests run against ALL profiles to ensure correct behavior regardless of user's profile choice.
 */

// Test releases with varying quality/attributes
const TEST_RELEASES = {
	// High quality releases
	'4k-remux': 'Movie.2024.2160p.UHD.BluRay.REMUX.DTS-HD.MA-GROUP',
	'4k-webdl': 'Movie.2024.2160p.WEB-DL.DDP5.1.H.265-GROUP',
	'1080p-bluray': 'Movie.2024.1080p.BluRay.x264.DTS-GROUP',
	'1080p-webdl': 'Movie.2024.1080p.WEB-DL.DD5.1.H.264-GROUP',
	'720p-webdl': 'Movie.2024.720p.WEB-DL.x264-GROUP',
	'720p-hdtv': 'Movie.2024.720p.HDTV.x264-GROUP',

	// Size-optimized releases (YTS/YIFY) - valued in MICRO, penalized in BEST
	'yts-1080p': 'Movie.2024.1080p.BluRay.x264-YTS.MX',
	'yify-720p': 'Movie.2024.720p.BluRay.x264-YIFY',

	// Banned content (CAM, TS, Screeners) - banned in ALL profiles
	cam: 'Movie.2024.CAM.x264-GROUP',
	ts: 'Movie.2024.TS.x264-GROUP',
	hdts: 'Movie.2024.HDTS.x264-GROUP',
	screener: 'Movie.2024.DVDScr.x264-GROUP',
	telecine: 'Movie.2024.TC.x264-GROUP',
	telesync: 'Movie.2024.TELESYNC.x264-GROUP',

	// Subtitle formats
	hardsub: 'Movie.2024.1080p.WEB-DL.x264.HardSub-GROUP',

	// HDR variants
	'dolby-vision': 'Movie.2024.2160p.WEB-DL.DV.HDR.DDP5.1-GROUP',
	hdr10: 'Movie.2024.2160p.WEB-DL.HDR10.DDP5.1-GROUP',
	hdr10plus: 'Movie.2024.2160p.WEB-DL.HDR10Plus.DDP5.1-GROUP',

	// Audio formats
	atmos: 'Movie.2024.2160p.WEB-DL.DDP5.1.Atmos-GROUP',
	truehd: 'Movie.2024.2160p.BluRay.TrueHD.7.1-GROUP',
	'dts-x': 'Movie.2024.2160p.BluRay.DTS-X.MA-GROUP'
};

// Content that is universally banned (actual banned content via BANNED_SCORE)
const UNIVERSALLY_BANNED = ['cam', 'screener'] as const;

// Releases that are NEVER banned (may have different scores per profile)
const NEVER_BANNED = [
	'4k-remux',
	'4k-webdl',
	'1080p-bluray',
	'1080p-webdl',
	'720p-webdl',
	'yts-1080p',
	'yify-720p'
] as const;

describe('Scoring System - All Profiles', () => {
	// Run ALL tests against EVERY profile
	describe.each(DEFAULT_PROFILES)('Profile: $name', (profile: ScoringProfile) => {
		describe('Universal Bans', () => {
			it.each(UNIVERSALLY_BANNED)('should ban %s content', (releaseKey) => {
				const result = scoreRelease(TEST_RELEASES[releaseKey], profile);
				expect(result.isBanned).toBe(true);
			});
		});

		describe('Never Banned Releases', () => {
			it.each(NEVER_BANNED)('should NOT ban %s', (releaseKey) => {
				const result = scoreRelease(TEST_RELEASES[releaseKey], profile);
				expect(result.isBanned).toBe(false);
			});
		});

		describe('YTS/YIFY Scoring', () => {
			it('should NOT ban YTS releases (they are scored, not banned)', () => {
				const ytsResult = scoreRelease(TEST_RELEASES['yts-1080p'], profile);

				// YTS is NEVER banned in ANY profile
				expect(ytsResult.isBanned).toBe(false);
			});

			it('should NOT ban YIFY releases', () => {
				const yifyResult = scoreRelease(TEST_RELEASES['yify-720p'], profile);

				// YIFY is NEVER banned in ANY profile
				expect(yifyResult.isBanned).toBe(false);
			});
		});

		describe('Scoring Returns Valid Results', () => {
			it('should return valid totalScore for all test releases', () => {
				for (const [_key, release] of Object.entries(TEST_RELEASES)) {
					const result = scoreRelease(release, profile);

					expect(result).toBeDefined();
					expect(typeof result.totalScore).toBe('number');
					expect(result.profile).toBe(profile.name);
					expect(result.releaseName).toBe(release);

					// If banned, totalScore should be -Infinity
					if (result.isBanned) {
						expect(result.totalScore).toBe(-Infinity);
					}
				}
			});

			it('should include breakdown categories', () => {
				const result = scoreRelease(TEST_RELEASES['1080p-bluray'], profile);

				expect(result.breakdown).toBeDefined();
				expect(result.breakdown.resolution).toBeDefined();
				expect(result.breakdown.source).toBeDefined();
				expect(result.breakdown.codec).toBeDefined();
				expect(result.breakdown.audio).toBeDefined();
			});
		});

		describe('Quality Ordering (Profile-Aware)', () => {
			it('should score resolution based on profile preference', () => {
				const score4k = scoreRelease(TEST_RELEASES['4k-webdl'], profile);
				const score1080p = scoreRelease(TEST_RELEASES['1080p-webdl'], profile);

				// Most profiles prefer 4K over 1080p
				// But MICRO prefers smaller files, so 1080p > 4K
				if (profile.name === 'Micro') {
					// Micro profile: 1080p scores higher than 4K
					expect(score1080p.breakdown.resolution.score).toBeGreaterThan(
						score4k.breakdown.resolution.score
					);
				} else {
					// Other profiles: 4K >= 1080p
					expect(score4k.breakdown.resolution.score).toBeGreaterThanOrEqual(
						score1080p.breakdown.resolution.score
					);
				}
			});

			it('should score 1080p releases higher than 720p', () => {
				const score1080p = scoreRelease(TEST_RELEASES['1080p-webdl'], profile);
				const score720p = scoreRelease(TEST_RELEASES['720p-webdl'], profile);

				expect(score1080p.breakdown.resolution.score).toBeGreaterThanOrEqual(
					score720p.breakdown.resolution.score
				);
			});
		});

		describe('Banned Content Has Negative Total', () => {
			it('should return -Infinity for banned content', () => {
				const result = scoreRelease(TEST_RELEASES['cam'], profile);

				expect(result.isBanned).toBe(true);
				expect(result.totalScore).toBe(-Infinity);
			});
		});
	});
});

describe('Upgrade Detection - Torrent Profiles', () => {
	// Uses TORRENT_PROFILES because streaming profile doesn't have torrent format scores
	describe.each(TORRENT_PROFILES)('Profile: $name', (profile: ScoringProfile) => {
		describe('Resolution Upgrades', () => {
			it('should identify 720p → 1080p as upgrade', () => {
				const result = isUpgrade(
					TEST_RELEASES['720p-webdl'],
					TEST_RELEASES['1080p-webdl'],
					profile
				);
				expect(result.isUpgrade).toBe(true);
				expect(result.improvement).toBeGreaterThan(0);
			});

			it('should handle 1080p → 4K based on profile preference', () => {
				const result = isUpgrade(TEST_RELEASES['1080p-webdl'], TEST_RELEASES['4k-webdl'], profile);
				// Whether this is an upgrade depends on the profile
				// ALL profiles now consider 4K HEVC WEB-DL as good or better than 1080p
				// Even Micro: 4K HEVC WEB-DL is efficient and acceptable
				expect(result.isUpgrade).toBe(true);
				expect(result.improvement).toBeGreaterThan(0);
			});

			it('should NOT identify 1080p → 720p as upgrade (downgrade)', () => {
				const result = isUpgrade(
					TEST_RELEASES['1080p-webdl'],
					TEST_RELEASES['720p-webdl'],
					profile
				);
				expect(result.isUpgrade).toBe(false);
				expect(result.improvement).toBeLessThan(0);
			});

			it('should NOT identify same quality as upgrade', () => {
				const result = isUpgrade(
					TEST_RELEASES['1080p-webdl'],
					TEST_RELEASES['1080p-webdl'],
					profile
				);
				expect(result.isUpgrade).toBe(false);
				expect(result.improvement).toBe(0);
			});
		});

		describe('Banned Content Cannot Be Upgrade', () => {
			it('should NOT identify CAM as upgrade from any quality', () => {
				const result = isUpgrade(TEST_RELEASES['720p-webdl'], TEST_RELEASES['cam'], profile);
				// Banned content cannot be an upgrade regardless of score
				expect(result.isUpgrade).toBe(false);
				expect(result.candidate.isBanned).toBe(true);
			});

			it('should NOT identify screener as upgrade from any quality', () => {
				const result = isUpgrade(TEST_RELEASES['720p-webdl'], TEST_RELEASES['screener'], profile);
				expect(result.isUpgrade).toBe(false);
				expect(result.candidate.isBanned).toBe(true);
			});
		});

		describe('Upgrade Options', () => {
			it('should respect minimumImprovement option', () => {
				// 720p → 1080p should be a small enough upgrade
				const withNoMin = isUpgrade(
					TEST_RELEASES['720p-webdl'],
					TEST_RELEASES['1080p-webdl'],
					profile,
					{ minimumImprovement: 0 }
				);

				// But not if we require huge improvement
				const withHugeMin = isUpgrade(
					TEST_RELEASES['720p-webdl'],
					TEST_RELEASES['1080p-webdl'],
					profile,
					{ minimumImprovement: 999999 }
				);

				expect(withNoMin.isUpgrade).toBe(true);
				expect(withHugeMin.isUpgrade).toBe(false);
			});

			it('should respect allowSidegrade option', () => {
				// Same release - no improvement
				const withoutSidegrade = isUpgrade(
					TEST_RELEASES['1080p-webdl'],
					TEST_RELEASES['1080p-webdl'],
					profile,
					{ allowSidegrade: false }
				);

				const withSidegrade = isUpgrade(
					TEST_RELEASES['1080p-webdl'],
					TEST_RELEASES['1080p-webdl'],
					profile,
					{ allowSidegrade: true }
				);

				expect(withoutSidegrade.isUpgrade).toBe(false);
				// With sidegrade allowed, 0 improvement should pass
				expect(withSidegrade.isUpgrade).toBe(true);
			});
		});
	});
});

describe('Edge Cases - All Profiles', () => {
	describe.each(DEFAULT_PROFILES)('Profile: $name', (profile: ScoringProfile) => {
		it('should handle empty release name gracefully', () => {
			const result = scoreRelease('', profile);
			expect(result).toBeDefined();
			expect(typeof result.totalScore).toBe('number');
		});

		it('should handle release with minimal info', () => {
			const result = scoreRelease('Movie.2024-GROUP', profile);
			expect(result).toBeDefined();
			expect(result.isBanned).toBe(false); // Unknown quality shouldn't be banned
		});

		it('should parse complex release names correctly', () => {
			const complexRelease =
				'Movie.2024.PROPER.REPACK.2160p.UHD.BluRay.REMUX.HDR.DV.TrueHD.7.1.Atmos-GROUP';
			const result = scoreRelease(complexRelease, profile);

			expect(result).toBeDefined();
			expect(result.isBanned).toBe(false);
		});
	});
});

describe('Profile-Specific Behavior', () => {
	it('should have different scoring strategies across profiles', () => {
		const bestProfile = DEFAULT_PROFILES.find((p) => p.name === 'Best');
		const microProfile = DEFAULT_PROFILES.find((p) => p.name === 'Micro');

		expect(bestProfile).toBeDefined();
		expect(microProfile).toBeDefined();

		if (bestProfile && microProfile) {
			// YTS gets +5000 in MICRO, -5000 in BEST
			// This tests the formatScores differ between profiles
			const ytsInBest = scoreRelease(TEST_RELEASES['yts-1080p'], bestProfile);
			const ytsInMicro = scoreRelease(TEST_RELEASES['yts-1080p'], microProfile);

			// Both NOT banned
			expect(ytsInBest.isBanned).toBe(false);
			expect(ytsInMicro.isBanned).toBe(false);

			// But different total scores
			expect(ytsInMicro.totalScore).toBeGreaterThan(ytsInBest.totalScore);
		}
	});

	it('should have consistent ban rules for CAM across all profiles', () => {
		const camScores = DEFAULT_PROFILES.map((profile) => ({
			profile: profile.name,
			result: scoreRelease(TEST_RELEASES['cam'], profile)
		}));

		// CAM should be banned in ALL profiles
		camScores.forEach(({ result }) => {
			expect(result.isBanned).toBe(true);
		});
	});

	it('all 3 default profiles should exist', () => {
		expect(DEFAULT_PROFILES.length).toBeGreaterThanOrEqual(3);

		const profileNames = DEFAULT_PROFILES.map((p) => p.name);
		expect(profileNames).toContain('Best');
		expect(profileNames).toContain('Efficient');
		expect(profileNames).toContain('Micro');
	});
});

describe('Size Validation - All Profiles', () => {
	describe.each(DEFAULT_PROFILES)('Profile: $name', (profile: ScoringProfile) => {
		it('should validate movie size when context provided', () => {
			// Test with a 50GB file (likely too big for most profiles)
			const result = scoreRelease(
				TEST_RELEASES['1080p-bluray'],
				profile,
				undefined,
				50 * 1024 * 1024 * 1024, // 50GB in bytes
				{ mediaType: 'movie' }
			);

			expect(result).toBeDefined();
			// Size rejection depends on profile settings
			if (profile.movieMaxSizeGb && Number(profile.movieMaxSizeGb) < 50) {
				expect(result.sizeRejected).toBe(true);
			}
		});

		it('should validate episode size when context provided', () => {
			// Test with a 5GB episode (likely too big)
			const result = scoreRelease(
				TEST_RELEASES['1080p-webdl'],
				profile,
				undefined,
				5 * 1024 * 1024 * 1024, // 5GB in bytes
				{ mediaType: 'tv', isSeasonPack: false }
			);

			expect(result).toBeDefined();
			// Just ensure it returns valid result - rejection depends on profile
			expect(typeof result.sizeRejected).toBe('boolean');
		});

		it('should handle season packs with episode count', () => {
			// 10GB season pack with 10 episodes = 1GB per episode
			const result = scoreRelease(
				TEST_RELEASES['1080p-webdl'],
				profile,
				undefined,
				10 * 1024 * 1024 * 1024,
				{ mediaType: 'tv', isSeasonPack: true, episodeCount: 10 }
			);

			expect(result).toBeDefined();
			expect(typeof result.sizeRejected).toBe('boolean');
		});

		it('should skip size validation for season pack without episode count', () => {
			const result = scoreRelease(
				TEST_RELEASES['1080p-webdl'],
				profile,
				undefined,
				10 * 1024 * 1024 * 1024,
				{ mediaType: 'tv', isSeasonPack: true, episodeCount: 0 }
			);

			// Implementation skips size validation when episode count is unknown
			// This allows the release through - user can evaluate size manually
			expect(result.sizeRejected).toBe(false);
		});
	});
});
