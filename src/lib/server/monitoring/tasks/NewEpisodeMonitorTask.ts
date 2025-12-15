/**
 * New Episode Monitor Task
 *
 * Searches for episodes that have recently aired.
 * Runs periodically (default: hourly) to grab new episodes as they become available.
 */

import { db } from '$lib/server/db/index.js';
import { monitoringHistory } from '$lib/server/db/schema.js';
import { monitoringSearchService } from '../search/MonitoringSearchService.js';
import { logger } from '$lib/logging/index.js';
import type { TaskResult } from '../MonitoringScheduler.js';

/**
 * Execute new episode search task
 * @param intervalHours - The interval in hours for determining "recently aired"
 * @param taskHistoryId - Optional ID linking to taskHistory for activity tracking
 */
export async function executeNewEpisodeMonitorTask(
	intervalHours: number,
	taskHistoryId?: string
): Promise<TaskResult> {
	const executedAt = new Date();
	logger.info('[NewEpisodeMonitorTask] Starting new episode search', {
		intervalHours,
		taskHistoryId
	});

	let itemsProcessed = 0;
	let itemsGrabbed = 0;
	let errors = 0;

	try {
		// Search for newly aired episodes
		const episodeResults = await monitoringSearchService.searchNewEpisodes(intervalHours);

		itemsProcessed = episodeResults.summary.searched;
		itemsGrabbed = episodeResults.summary.grabbed;
		errors = episodeResults.summary.errors;

		logger.info('[NewEpisodeMonitorTask] New episode search completed', {
			searched: episodeResults.summary.searched,
			grabbed: episodeResults.summary.grabbed,
			errors: episodeResults.summary.errors
		});

		// Record history for each episode
		for (const item of episodeResults.items) {
			if (!item.searched && item.skipped) continue;

			await db.insert(monitoringHistory).values({
				taskHistoryId,
				taskType: 'new_episode',
				episodeId: item.itemType === 'episode' ? item.itemId : undefined,
				status: item.grabbed
					? 'grabbed'
					: item.error
						? 'error'
						: item.releasesFound > 0
							? 'found'
							: 'no_results',
				releasesFound: item.releasesFound,
				releaseGrabbed: item.grabbedRelease,
				queueItemId: item.queueItemId,
				isUpgrade: false,
				errorMessage: item.error,
				executedAt: executedAt.toISOString()
			});
		}

		logger.info('[NewEpisodeMonitorTask] New episode monitor task completed', {
			totalProcessed: itemsProcessed,
			totalGrabbed: itemsGrabbed,
			totalErrors: errors
		});

		return {
			taskType: 'new_episode',
			itemsProcessed,
			itemsGrabbed,
			errors,
			executedAt
		};
	} catch (error) {
		logger.error('[NewEpisodeMonitorTask] Task failed', error);
		throw error;
	}
}
