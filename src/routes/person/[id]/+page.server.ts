import { tmdb } from '$lib/server/tmdb';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logger } from '$lib/logging';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) {
		throw error(400, 'Invalid person ID');
	}

	try {
		// Fetch ONLY person details - no credits
		// This is ~5KB vs 150KB+ with combined_credits
		// Credits are loaded lazily by SectionRow via /api/tmdb/person/{id}/credits
		const person = await tmdb.getPersonBasic(id);

		return { person };
	} catch (e) {
		logger.error('Failed to fetch person', e, { personId: id });
		throw error(404, 'Person not found');
	}
};
