import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { downloadQueue, downloadClients } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { logger } from '$lib/logging';
import { redactUrl } from '$lib/server/utils/urlSecurity';

/**
 * POST - Retry a failed download
 *
 * This will re-add the download to the client with the same parameters
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		// Get queue item
		const queueItem = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).get();

		if (!queueItem) {
			throw error(404, 'Queue item not found');
		}

		// Only allow retrying failed downloads
		if (queueItem.status !== 'failed' && queueItem.status !== 'warning') {
			throw error(400, `Cannot retry download with status: ${queueItem.status}`);
		}

		// Get download client
		if (!queueItem.downloadClientId) {
			throw error(400, 'No download client associated with this queue item');
		}

		const client = await db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, queueItem.downloadClientId))
			.get();

		if (!client) {
			throw error(404, 'Download client not found');
		}

		// We need either a magnet URL or download URL to retry
		const downloadUrl = queueItem.magnetUrl || queueItem.downloadUrl;
		if (!downloadUrl) {
			throw error(
				400,
				'No download URL available for retry. Consider re-searching and grabbing again.'
			);
		}

		// Get download client instance
		const clientInstance = await getDownloadClientManager().getClientInstance(client.id);
		if (!clientInstance) {
			throw error(500, 'Failed to get download client instance');
		}

		// Determine category based on media type
		const clientConfig = await getDownloadClientManager().getClient(client.id);
		const category = queueItem.movieId
			? (clientConfig?.movieCategory ?? 'movies')
			: (clientConfig?.tvCategory ?? 'tv');

		// Re-add to download client
		const newInfoHash = await clientInstance.addDownload({
			magnetUri: queueItem.magnetUrl || undefined,
			downloadUrl: queueItem.magnetUrl ? undefined : queueItem.downloadUrl || undefined,
			category
		});

		await db
			.update(downloadQueue)
			.set({
				status: 'queued',
				downloadId: newInfoHash || queueItem.downloadId,
				infoHash: newInfoHash || queueItem.infoHash,
				progress: '0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				eta: null,
				errorMessage: null,
				importAttempts: (queueItem.importAttempts || 0) + 1,
				lastAttemptAt: new Date().toISOString()
			})
			.where(eq(downloadQueue.id, id));

		// Get updated item
		const updatedItem = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).get();

		// Redact sensitive URLs before returning
		const safeItem = updatedItem
			? {
					...updatedItem,
					downloadUrl: updatedItem.downloadUrl ? redactUrl(updatedItem.downloadUrl) : null
				}
			: null;

		return json({
			success: true,
			message: 'Download retry initiated',
			queueItem: safeItem
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		logger.error('Error retrying download', err instanceof Error ? err : undefined);
		throw error(500, 'Failed to retry download');
	}
};
