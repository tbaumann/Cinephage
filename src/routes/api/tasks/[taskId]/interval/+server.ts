/**
 * Task Interval API
 *
 * PUT /api/tasks/[taskId]/interval - Updates the interval for a scheduled task
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getUnifiedTaskById,
	isScheduledTask,
	isIntervalEditable
} from '$lib/server/tasks/UnifiedTaskRegistry';
import {
	monitoringScheduler,
	type MonitoringSettings
} from '$lib/server/monitoring/MonitoringScheduler';
import { z } from 'zod';

const bodySchema = z.object({
	intervalHours: z.number().positive()
});

/**
 * Convert snake_case database key to camelCase settings key
 */
function snakeToCamel(str: string): string {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * PUT /api/tasks/[taskId]/interval
 *
 * Updates the interval for a scheduled task.
 * Only works for scheduled tasks with editable intervals.
 *
 * Body: { intervalHours: number }
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const { taskId } = params;

	// Verify task exists
	const task = getUnifiedTaskById(taskId);
	if (!task) {
		throw error(404, { message: `Task '${taskId}' not found` });
	}

	// Verify it's a scheduled task
	if (!isScheduledTask(taskId)) {
		throw error(400, { message: `Task '${taskId}' is not a scheduled task` });
	}

	// Verify interval is editable
	if (!isIntervalEditable(taskId)) {
		throw error(400, { message: `Task '${taskId}' interval cannot be edited` });
	}

	// Parse body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, { message: 'Invalid JSON body' });
	}

	const parseResult = bodySchema.safeParse(body);
	if (!parseResult.success) {
		throw error(400, { message: parseResult.error.issues[0]?.message ?? 'Invalid interval' });
	}

	const { intervalHours } = parseResult.data;

	// Validate minimum interval
	const minInterval = task.minIntervalHours ?? 0.25;
	if (intervalHours < minInterval) {
		throw error(400, {
			message: `Interval must be at least ${minInterval} hours (${minInterval * 60} minutes)`
		});
	}

	// Get settings key from registry (convert snake_case intervalKey to camelCase)
	if (!task.intervalKey) {
		throw error(400, { message: `Task '${taskId}' does not have a configurable interval` });
	}
	const settingsKey = snakeToCamel(task.intervalKey) as keyof MonitoringSettings;

	// Update the setting
	await monitoringScheduler.updateSettings({
		[settingsKey]: intervalHours
	});

	return json({
		success: true,
		taskId,
		intervalHours
	});
};
