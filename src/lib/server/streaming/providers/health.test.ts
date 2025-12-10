/**
 * Provider Health Tracker Unit Tests
 *
 * Tests the health tracking, scoring, and prioritization logic.
 * No network calls required - tests internal logic only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	getHealthTracker,
	recordProviderSuccess,
	recordProviderFailure,
	getProviderHealth,
	getAllProviderHealth,
	type ProviderHealth as _ProviderHealth
} from './health';

describe('Provider Health Tracker', () => {
	beforeEach(() => {
		// Reset all health data before each test
		getHealthTracker().resetAll();
	});

	describe('Initial State', () => {
		it('should initialize new provider with neutral values', () => {
			const health = getProviderHealth('videasy');

			expect(health.providerId).toBe('videasy');
			expect(health.successCount).toBe(0);
			expect(health.failureCount).toBe(0);
			expect(health.successRate).toBe(0.5); // Neutral start
			expect(health.averageLatencyMs).toBe(0);
			expect(health.latencySamples).toHaveLength(0);
		});

		it('should return empty array for getAllHealth initially', () => {
			const all = getAllProviderHealth();
			expect(all).toHaveLength(0);
		});
	});

	describe('Recording Success', () => {
		it('should increment success count', () => {
			recordProviderSuccess('videasy', 500);
			const health = getProviderHealth('videasy');

			expect(health.successCount).toBe(1);
			expect(health.failureCount).toBe(0);
		});

		it('should track lastSuccess timestamp', () => {
			const before = new Date();
			recordProviderSuccess('videasy', 500);
			const health = getProviderHealth('videasy');
			const after = new Date();

			expect(health.lastSuccess).toBeDefined();
			expect(health.lastSuccess!.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(health.lastSuccess!.getTime()).toBeLessThanOrEqual(after.getTime());
		});

		it('should add latency sample on success', () => {
			recordProviderSuccess('videasy', 500);
			const health = getProviderHealth('videasy');

			expect(health.latencySamples).toHaveLength(1);
			expect(health.latencySamples[0]).toBe(500);
		});

		it('should calculate average latency from samples', () => {
			recordProviderSuccess('videasy', 400);
			recordProviderSuccess('videasy', 600);
			const health = getProviderHealth('videasy');

			expect(health.averageLatencyMs).toBe(500);
		});
	});

	describe('Recording Failure', () => {
		it('should increment failure count', () => {
			recordProviderFailure('videasy', 1000);
			const health = getProviderHealth('videasy');

			expect(health.successCount).toBe(0);
			expect(health.failureCount).toBe(1);
		});

		it('should track lastFailure timestamp', () => {
			const before = new Date();
			recordProviderFailure('videasy', 1000);
			const health = getProviderHealth('videasy');
			const after = new Date();

			expect(health.lastFailure).toBeDefined();
			expect(health.lastFailure!.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(health.lastFailure!.getTime()).toBeLessThanOrEqual(after.getTime());
		});

		it('should NOT add latency sample on failure', () => {
			recordProviderFailure('videasy', 1000);
			const health = getProviderHealth('videasy');

			// Failures don't contribute to latency average
			expect(health.latencySamples).toHaveLength(0);
		});
	});

	describe('Success Rate Calculation', () => {
		it('should remain neutral until MIN_REQUESTS_FOR_RATE (5) reached', () => {
			// Record 4 successes - not enough for rate calculation
			for (let i = 0; i < 4; i++) {
				recordProviderSuccess('videasy', 500);
			}
			const health = getProviderHealth('videasy');

			// Should still be neutral 0.5
			expect(health.successRate).toBe(0.5);
		});

		it('should calculate success rate after 5+ requests', () => {
			// 4 successes + 1 failure = 80% success rate
			for (let i = 0; i < 4; i++) {
				recordProviderSuccess('videasy', 500);
			}
			recordProviderFailure('videasy', 1000);

			const health = getProviderHealth('videasy');
			expect(health.successRate).toBe(0.8);
		});

		it('should handle 100% success rate', () => {
			for (let i = 0; i < 10; i++) {
				recordProviderSuccess('videasy', 500);
			}
			const health = getProviderHealth('videasy');
			expect(health.successRate).toBe(1.0);
		});

		it('should handle 0% success rate', () => {
			for (let i = 0; i < 5; i++) {
				recordProviderFailure('videasy', 1000);
			}
			const health = getProviderHealth('videasy');
			expect(health.successRate).toBe(0);
		});
	});

	describe('Latency Sample Management', () => {
		it('should keep only last 10 latency samples', () => {
			// Record 15 successes with different latencies
			for (let i = 0; i < 15; i++) {
				recordProviderSuccess('videasy', (i + 1) * 100);
			}
			const health = getProviderHealth('videasy');

			// Should only have 10 samples
			expect(health.latencySamples).toHaveLength(10);

			// Should have kept the last 10 (samples 6-15, which are 600-1500ms)
			expect(health.latencySamples[0]).toBe(600);
			expect(health.latencySamples[9]).toBe(1500);
		});

		it('should calculate rolling average correctly', () => {
			// Add samples: 600 to 1500 (10 samples)
			for (let i = 6; i <= 15; i++) {
				recordProviderSuccess('videasy', i * 100);
			}
			const health = getProviderHealth('videasy');

			// Average of 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500
			const expected = (600 + 700 + 800 + 900 + 1000 + 1100 + 1200 + 1300 + 1400 + 1500) / 10;
			expect(health.averageLatencyMs).toBe(expected);
		});
	});

	describe('Provider Scoring', () => {
		const tracker = getHealthTracker();

		it('should return neutral score (50) for new providers', () => {
			const score = tracker.getProviderScore('videasy');
			expect(score).toBe(50);
		});

		it('should return neutral score when not enough requests', () => {
			// Only 3 requests (below MIN_REQUESTS_FOR_RATE of 5)
			recordProviderSuccess('videasy', 500);
			recordProviderSuccess('videasy', 500);
			recordProviderSuccess('videasy', 500);

			const score = tracker.getProviderScore('videasy');
			expect(score).toBe(50);
		});

		it('should give high score to provider with 100% success and fast latency', () => {
			// Perfect provider: 100% success, 500ms avg latency
			for (let i = 0; i < 10; i++) {
				recordProviderSuccess('videasy', 500);
			}

			const score = tracker.getProviderScore('videasy');

			// Success component: 1.0 * 70 = 70
			// Latency component: 30 - (500/5000) * 30 = 30 - 3 = 27
			// Total: 97
			expect(score).toBeGreaterThan(90);
		});

		it('should give low score to provider with 0% success', () => {
			// Failing provider
			for (let i = 0; i < 5; i++) {
				recordProviderFailure('videasy', 1000);
			}

			const score = tracker.getProviderScore('videasy');

			// Success component: 0 * 70 = 0
			// Latency component: 30 - (0/5000)*30 = 30 (0 latency from no successful samples)
			// Total: 30
			// This is expected behavior - latency score is neutral when no data
			expect(score).toBe(30);
		});

		it('should penalize slow latency', () => {
			// Slow but successful provider (5000ms avg)
			for (let i = 0; i < 5; i++) {
				recordProviderSuccess('videasy', 5000);
			}

			const score = tracker.getProviderScore('videasy');

			// Success: 70 (100%)
			// Latency: 30 - (5000/5000)*30 = 0
			// Total: 70
			expect(score).toBe(70);
		});
	});

	describe('Provider Sorting by Success Rate', () => {
		const tracker = getHealthTracker();

		it('should sort providers by success rate (descending)', () => {
			// Setup: Provider A with 100% success
			for (let i = 0; i < 5; i++) {
				recordProviderSuccess('videasy', 500);
			}

			// Setup: Provider B with 60% success
			for (let i = 0; i < 3; i++) {
				recordProviderSuccess('vidlink', 500);
			}
			for (let i = 0; i < 2; i++) {
				recordProviderFailure('vidlink', 1000);
			}

			// Setup: Provider C with 20% success
			for (let i = 0; i < 1; i++) {
				recordProviderSuccess('xprime', 500);
			}
			for (let i = 0; i < 4; i++) {
				recordProviderFailure('xprime', 1000);
			}

			const sorted = tracker.getProvidersBySuccessRate();

			expect(sorted[0]).toBe('videasy'); // 100%
			expect(sorted[1]).toBe('vidlink'); // 60%
			expect(sorted[2]).toBe('xprime'); // 20%
		});

		it('should use latency as tiebreaker when success rates are similar', () => {
			// Two providers with same success rate but different latency
			for (let i = 0; i < 5; i++) {
				recordProviderSuccess('videasy', 1000); // Slow
			}
			for (let i = 0; i < 5; i++) {
				recordProviderSuccess('vidlink', 200); // Fast
			}

			const sorted = tracker.getProvidersBySuccessRate();

			// Both 100% success, but vidlink is faster
			expect(sorted[0]).toBe('vidlink');
			expect(sorted[1]).toBe('videasy');
		});
	});

	describe('Reset Functionality', () => {
		it('should reset single provider', () => {
			recordProviderSuccess('videasy', 500);
			recordProviderSuccess('vidlink', 500);

			getHealthTracker().reset('videasy');

			// Videasy should be reset
			const videasyHealth = getProviderHealth('videasy');
			expect(videasyHealth.successCount).toBe(0);

			// Vidlink should be unchanged
			const vidlinkHealth = getProviderHealth('vidlink');
			expect(vidlinkHealth.successCount).toBe(1);
		});

		it('should reset all providers', () => {
			recordProviderSuccess('videasy', 500);
			recordProviderSuccess('vidlink', 500);
			recordProviderSuccess('xprime', 500);

			getHealthTracker().resetAll();

			const all = getAllProviderHealth();
			expect(all).toHaveLength(0);
		});
	});

	describe('Multiple Providers', () => {
		it('should track multiple providers independently', () => {
			recordProviderSuccess('videasy', 300);
			recordProviderSuccess('videasy', 400);
			recordProviderFailure('vidlink', 1000);
			recordProviderSuccess('xprime', 500);

			const videasy = getProviderHealth('videasy');
			const vidlink = getProviderHealth('vidlink');
			const xprime = getProviderHealth('xprime');

			expect(videasy.successCount).toBe(2);
			expect(videasy.failureCount).toBe(0);
			expect(videasy.averageLatencyMs).toBe(350);

			expect(vidlink.successCount).toBe(0);
			expect(vidlink.failureCount).toBe(1);

			expect(xprime.successCount).toBe(1);
			expect(xprime.failureCount).toBe(0);
		});
	});
});
