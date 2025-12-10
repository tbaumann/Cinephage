/**
 * Task Run Endpoint
 *
 * POST /api/tasks/[taskId]/run
 *
 * Executes a registered system task and tracks its execution in history.
 * Prevents concurrent runs of the same task.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTaskById } from '$lib/server/tasks/registry';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'TaskRunAPI' });

export const POST: RequestHandler = async ({ params, fetch, request }) => {
	const { taskId } = params;

	// Validate task exists in registry
	const taskDef = getTaskById(taskId);
	if (!taskDef) {
		return json({ success: false, error: `Task '${taskId}' not found` }, { status: 404 });
	}

	// Check if task is already running
	if (taskHistoryService.isTaskRunning(taskId)) {
		return json({ success: false, error: `Task '${taskId}' is already running` }, { status: 409 });
	}

	logger.info('[TaskRunAPI] Starting task', { taskId, endpoint: taskDef.endpoint });

	// Start tracking the task
	let historyId: string;
	try {
		historyId = await taskHistoryService.startTask(taskId);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start task';
		return json({ success: false, error: message }, { status: 500 });
	}

	try {
		// Execute the task's endpoint
		const response = await fetch(taskDef.endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				// Forward relevant headers from original request
				...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie')! } : {})
			}
		});

		const result = await response.json();

		if (result.success) {
			await taskHistoryService.completeTask(historyId, result);
			logger.info('[TaskRunAPI] Task completed successfully', { taskId, result });
			return json({ success: true, historyId, ...result });
		} else {
			const errors = [result.error || 'Task endpoint returned failure'];
			await taskHistoryService.failTask(historyId, errors);
			logger.error('[TaskRunAPI] Task failed', { taskId, errors });
			return json({ success: false, historyId, ...result });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await taskHistoryService.failTask(historyId, [message]);
		logger.error('[TaskRunAPI] Task execution error', { taskId, error: message });
		return json({ success: false, historyId, error: message }, { status: 500 });
	}
};
