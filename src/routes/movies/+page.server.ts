import { db } from '$lib/server/db/index.js';
import { movies, movieFiles, rootFolders, scoringProfiles } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { LibraryMovie, MovieFile } from '$lib/types/library';
import { logger } from '$lib/logging';
import { DEFAULT_PROFILES } from '$lib/server/scoring/profiles.js';

export interface QualityProfileSummary {
	id: string;
	name: string;
	description: string;
	isBuiltIn: boolean;
	isDefault: boolean;
}

export const load: PageServerLoad = async ({ url }) => {
	// Parse URL params for sorting and filtering
	const sort = url.searchParams.get('sort') || 'title-asc';
	const monitored = url.searchParams.get('monitored') || 'all';
	const fileStatus = url.searchParams.get('fileStatus') || 'all';

	try {
		// Fetch all movies with their root folder info
		const allMovies = await db
			.select({
				id: movies.id,
				tmdbId: movies.tmdbId,
				imdbId: movies.imdbId,
				title: movies.title,
				originalTitle: movies.originalTitle,
				year: movies.year,
				overview: movies.overview,
				posterPath: movies.posterPath,
				backdropPath: movies.backdropPath,
				runtime: movies.runtime,
				genres: movies.genres,
				path: movies.path,
				rootFolderId: movies.rootFolderId,
				rootFolderPath: rootFolders.path,
				qualityPresetId: movies.qualityPresetId,
				scoringProfileId: movies.scoringProfileId,
				monitored: movies.monitored,
				minimumAvailability: movies.minimumAvailability,
				wantsSubtitles: movies.wantsSubtitles,
				added: movies.added,
				hasFile: movies.hasFile
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id));

		// Get file info for each movie
		const moviesWithFiles: LibraryMovie[] = await Promise.all(
			allMovies.map(async (movie) => {
				const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movie.id));

				return {
					...movie,
					files: files.map((f) => ({
						id: f.id,
						relativePath: f.relativePath,
						size: f.size,
						dateAdded: f.dateAdded,
						quality: f.quality as MovieFile['quality'],
						mediaInfo: f.mediaInfo as MovieFile['mediaInfo'],
						releaseGroup: f.releaseGroup,
						edition: f.edition
					}))
				} as LibraryMovie;
			})
		);

		// Apply filters
		let filteredMovies = moviesWithFiles;

		// Filter by monitored status
		if (monitored === 'monitored') {
			filteredMovies = filteredMovies.filter((m) => m.monitored);
		} else if (monitored === 'unmonitored') {
			filteredMovies = filteredMovies.filter((m) => !m.monitored);
		}

		// Filter by file status
		if (fileStatus === 'hasFile') {
			filteredMovies = filteredMovies.filter((m) => m.hasFile);
		} else if (fileStatus === 'missingFile') {
			filteredMovies = filteredMovies.filter((m) => !m.hasFile);
		}

		// Apply sorting
		const [sortField, sortDir] = sort.split('-') as [string, 'asc' | 'desc'];
		filteredMovies.sort((a, b) => {
			let comparison = 0;

			switch (sortField) {
				case 'title':
					comparison = (a.title || '').localeCompare(b.title || '');
					break;
				case 'added':
					comparison = new Date(a.added).getTime() - new Date(b.added).getTime();
					break;
				case 'year':
					comparison = (a.year || 0) - (b.year || 0);
					break;
				default:
					comparison = (a.title || '').localeCompare(b.title || '');
			}

			return sortDir === 'desc' ? -comparison : comparison;
		});

		// Fetch quality profiles
		const dbProfiles = await db
			.select({
				id: scoringProfiles.id,
				name: scoringProfiles.name,
				description: scoringProfiles.description,
				isDefault: scoringProfiles.isDefault
			})
			.from(scoringProfiles);

		const BUILT_IN_IDS = DEFAULT_PROFILES.map((p) => p.id);
		const dbIds = new Set(dbProfiles.map((p) => p.id));
		const hasDbDefault = dbProfiles.some((p) => Boolean(p.isDefault));

		const qualityProfiles: QualityProfileSummary[] = [
			...DEFAULT_PROFILES.filter((p) => !dbIds.has(p.id)).map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				isBuiltIn: true,
				isDefault: !hasDbDefault && p.id === 'efficient'
			})),
			...dbProfiles.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description ?? '',
				isBuiltIn: BUILT_IN_IDS.includes(p.id),
				isDefault: Boolean(p.isDefault)
			}))
		];

		return {
			movies: filteredMovies,
			total: filteredMovies.length,
			totalUnfiltered: moviesWithFiles.length,
			filters: {
				sort,
				monitored,
				fileStatus
			},
			qualityProfiles
		};
	} catch (error) {
		logger.error('[Movies Page] Error loading movies', error instanceof Error ? error : undefined);
		return {
			movies: [],
			total: 0,
			totalUnfiltered: 0,
			filters: {
				sort,
				monitored,
				fileStatus
			},
			qualityProfiles: [],
			error: 'Failed to load movies'
		};
	}
};

export const actions = {
	toggleAllMonitored: async ({ request }) => {
		const formData = await request.formData();
		const monitored = formData.get('monitored') === 'true';

		try {
			await db.update(movies).set({ monitored });
			return { success: true };
		} catch (error) {
			logger.error(
				'[Movies] Failed to toggle all monitored',
				error instanceof Error ? error : undefined
			);
			return { success: false, error: 'Failed to update movies' };
		}
	}
};
