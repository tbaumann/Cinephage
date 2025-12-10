import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { movies, movieFiles, rootFolders, languageProfiles } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { z } from 'zod';
import { namingService, type MediaNamingInfo } from '$lib/server/library/naming/NamingService.js';
import { searchOnAdd } from '$lib/server/library/searchOnAdd.js';
import { qualityFilter } from '$lib/server/quality/index.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '$lib/errors';
import { logger } from '$lib/logging';
import { SearchWorker, workerManager } from '$lib/server/workers/index.js';

/**
 * Schema for adding a movie to the library
 */
const addMovieSchema = z.object({
	tmdbId: z.number().int().positive(),
	rootFolderId: z.string().min(1),
	scoringProfileId: z.string().optional(),
	monitored: z.boolean().default(true),
	minimumAvailability: z.enum(['announced', 'inCinemas', 'released', 'preDb']).default('released'),
	searchOnAdd: z.boolean().default(true),
	wantsSubtitles: z.boolean().default(true)
});

/**
 * Generate a folder name for a movie using the naming service
 */
function generateMovieFolderName(title: string, year?: number, tmdbId?: number): string {
	const info: MediaNamingInfo = {
		title,
		year,
		tmdbId
	};
	return namingService.generateMovieFolderName(info);
}

/**
 * GET /api/library/movies
 * List all movies in the library
 */
export const GET: RequestHandler = async () => {
	try {
		// Fetch all movies (1 query)
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
				scoringProfileId: movies.scoringProfileId,
				monitored: movies.monitored,
				minimumAvailability: movies.minimumAvailability,
				added: movies.added,
				hasFile: movies.hasFile
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id));

		// Fetch all movie files in a single query (1 query instead of N)
		const allFiles = await db.select().from(movieFiles);

		// Group files by movieId in memory (O(n) complexity, much faster than N queries)
		const filesByMovieId = new Map<string, typeof allFiles>();
		for (const file of allFiles) {
			const existing = filesByMovieId.get(file.movieId) || [];
			existing.push(file);
			filesByMovieId.set(file.movieId, existing);
		}

		// Map movies with their files (O(n) memory operation)
		const moviesWithFiles = allMovies.map((movie) => {
			const files = filesByMovieId.get(movie.id) || [];
			return {
				...movie,
				files: files.map((f) => ({
					id: f.id,
					relativePath: f.relativePath,
					size: f.size,
					dateAdded: f.dateAdded,
					quality: f.quality,
					mediaInfo: f.mediaInfo,
					releaseGroup: f.releaseGroup,
					edition: f.edition
				}))
			};
		});

		return json({
			success: true,
			movies: moviesWithFiles,
			total: moviesWithFiles.length
		});
	} catch (error) {
		logger.error('[API] Error fetching movies', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch movies'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/library/movies
 * Add a movie to the library by TMDB ID
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const result = addMovieSchema.safeParse(body);

		if (!result.success) {
			throw new ValidationError('Validation failed', {
				details: result.error.flatten()
			});
		}

		const {
			tmdbId,
			rootFolderId,
			scoringProfileId,
			monitored,
			minimumAvailability,
			searchOnAdd: shouldSearch,
			wantsSubtitles
		} = result.data;

		// Check if movie already exists
		const existingMovie = await db
			.select({ id: movies.id })
			.from(movies)
			.where(eq(movies.tmdbId, tmdbId))
			.limit(1);

		if (existingMovie.length > 0) {
			return json(
				{
					success: false,
					error: 'Movie already exists in library',
					movieId: existingMovie[0].id
				},
				{ status: 409 }
			);
		}

		// Verify root folder exists and is for movies
		const rootFolder = await db
			.select()
			.from(rootFolders)
			.where(eq(rootFolders.id, rootFolderId))
			.limit(1);

		if (rootFolder.length === 0) {
			throw new NotFoundError('Root folder', rootFolderId);
		}

		if (rootFolder[0].mediaType !== 'movie') {
			throw new ValidationError('Root folder is not configured for movies', {
				mediaType: rootFolder[0].mediaType,
				expected: 'movie'
			});
		}

		// Fetch movie details from TMDB
		let movieDetails;
		try {
			movieDetails = await tmdb.getMovie(tmdbId);
		} catch (error) {
			throw new ExternalServiceError(
				'TMDB',
				error instanceof Error ? error.message : 'Failed to fetch movie details'
			);
		}

		// Generate folder path
		const year = movieDetails.release_date
			? new Date(movieDetails.release_date).getFullYear()
			: undefined;
		const folderName = generateMovieFolderName(movieDetails.title, year, tmdbId);

		// Extract external IDs
		let imdbId: string | null = null;
		try {
			const externalIds = await tmdb.getMovieExternalIds(tmdbId);
			imdbId = externalIds.imdb_id;
		} catch {
			logger.warn('[API] Failed to fetch external IDs for movie', { tmdbId });
		}

		// Get the default scoring profile if none specified
		let effectiveProfileId = scoringProfileId;
		if (!effectiveProfileId) {
			const defaultProfile = await qualityFilter.getDefaultScoringProfile();
			effectiveProfileId = defaultProfile.id;
		}

		// Get the default language profile if wantsSubtitles is true
		let languageProfileId: string | null = null;
		if (wantsSubtitles) {
			const defaultLanguageProfile = await db.query.languageProfiles.findFirst({
				where: eq(languageProfiles.isDefault, true)
			});
			languageProfileId = defaultLanguageProfile?.id ?? null;

			if (!languageProfileId) {
				logger.warn('[API] No default language profile found for subtitle preferences', { tmdbId });
			}
		}

		// Insert movie into database
		const [newMovie] = await db
			.insert(movies)
			.values({
				tmdbId,
				imdbId,
				title: movieDetails.title,
				originalTitle: movieDetails.original_title,
				year,
				overview: movieDetails.overview,
				posterPath: movieDetails.poster_path,
				backdropPath: movieDetails.backdrop_path,
				runtime: movieDetails.runtime,
				genres: movieDetails.genres?.map((g) => g.name) ?? [],
				path: folderName,
				rootFolderId,
				scoringProfileId: effectiveProfileId,
				monitored,
				minimumAvailability,
				hasFile: false,
				wantsSubtitles,
				languageProfileId
			})
			.returning();

		// Trigger search if requested and movie is monitored
		let searchTriggered = false;
		if (shouldSearch && monitored) {
			// Create a search worker to run in the background with tracking
			const worker = new SearchWorker({
				mediaType: 'movie',
				mediaId: newMovie.id,
				title: movieDetails.title,
				tmdbId,
				searchFn: async () => {
					const result = await searchOnAdd.searchForMovie({
						movieId: newMovie.id,
						tmdbId,
						imdbId,
						title: movieDetails.title,
						year,
						scoringProfileId: scoringProfileId || undefined
					});
					return {
						searched: 1,
						found: result.success ? 1 : 0,
						grabbed: result.success ? 1 : 0
					};
				}
			});

			try {
				workerManager.spawnInBackground(worker);
				searchTriggered = true;
			} catch (error) {
				// Concurrency limit reached - fall back to fire and forget
				logger.warn('[API] Could not create search worker, running directly', {
					movieId: newMovie.id,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				searchOnAdd
					.searchForMovie({
						movieId: newMovie.id,
						tmdbId,
						imdbId,
						title: movieDetails.title,
						year,
						scoringProfileId: scoringProfileId || undefined
					})
					.catch((err) => {
						logger.warn('[API] Background search failed for movie', {
							movieId: newMovie.id,
							error: err instanceof Error ? err.message : 'Unknown error'
						});
					});
				searchTriggered = true;
			}
		}

		return json({
			success: true,
			movie: {
				id: newMovie.id,
				tmdbId: newMovie.tmdbId,
				title: newMovie.title,
				year: newMovie.year,
				path: newMovie.path,
				monitored: newMovie.monitored,
				searchTriggered
			}
		});
	} catch (error) {
		logger.error('[API] Error adding movie', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add movie'
			},
			{ status: 500 }
		);
	}
};
