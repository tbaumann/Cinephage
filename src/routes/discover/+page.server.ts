import { tmdb } from '$lib/server/tmdb';
import { getDiscoverResults } from '$lib/server/discover';
import { enrichWithLibraryStatus } from '$lib/server/library/status';
import type { WatchProvider } from '$lib/types/tmdb';
import { logger } from '$lib/logging';
import { parseDiscoverParams, isDefaultView as checkDefaultView } from '$lib/utils/discoverParams';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const params = parseDiscoverParams(url.searchParams);
	const {
		type,
		page,
		sortBy,
		withWatchProviders,
		watchRegion,
		withGenres,
		minDate,
		maxDate,
		minRating
	} = params;
	const isDefaultViewCheck = checkDefaultView(url.searchParams, params);

	// Check if TMDB is configured before making any API calls
	const tmdbConfigured = await tmdb.isConfigured();
	if (!tmdbConfigured) {
		return {
			viewType: 'not_configured' as const,
			tmdbConfigured: false,
			providers: [],
			genres: [],
			filters: {
				type,
				sort_by: sortBy,
				with_watch_providers: withWatchProviders,
				with_genres: withGenres
			}
		};
	}

	try {
		// Always fetch providers and genres
		const [providersData, movieGenresData, tvGenresData] = await Promise.all([
			tmdb.fetch(`/watch/providers/movie?watch_region=${watchRegion}`) as Promise<{
				results: WatchProvider[];
			} | null>,
			tmdb.fetch('/genre/movie/list') as Promise<{ genres: { id: number; name: string }[] } | null>,
			tmdb.fetch('/genre/tv/list') as Promise<{ genres: { id: number; name: string }[] } | null>
		]);

		// Handle null responses (shouldn't happen since we checked tmdbConfigured, but be safe)
		if (!providersData || !movieGenresData || !tvGenresData) {
			return {
				viewType: 'not_configured' as const,
				tmdbConfigured: false,
				providers: [],
				genres: [],
				filters: {
					type,
					sort_by: sortBy,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres
				}
			};
		}

		const providers = providersData.results.sort((a, b) => a.display_priority - b.display_priority);

		// Combine genres, deduplicate by ID
		const allGenres = new Map<number, { id: number; name: string }>();
		movieGenresData.genres.forEach((g) => allGenres.set(g.id, g));
		tvGenresData.genres.forEach((g) => allGenres.set(g.id, g));
		const genres = Array.from(allGenres.values()).sort((a, b) => a.name.localeCompare(b.name));

		// Type for paginated TMDB results
		interface TmdbPaginatedResult {
			results: Array<{ id: number } & Record<string, unknown>>;
			page: number;
			total_pages: number;
			total_results: number;
		}

		if (isDefaultViewCheck && page === '1') {
			// Fetch sections for the dashboard-style view
			const [trendingDay, trendingWeek, popularMovies, popularTV, topRatedMovies] =
				(await Promise.all([
					tmdb.fetch('/trending/all/day'),
					tmdb.fetch('/trending/all/week'),
					tmdb.fetch('/movie/popular'),
					tmdb.fetch('/tv/popular'),
					tmdb.fetch('/movie/top_rated')
				])) as TmdbPaginatedResult[];

			// Enrich all sections with library status
			const [
				enrichedTrendingDay,
				enrichedTrendingWeek,
				enrichedPopularMovies,
				enrichedPopularTV,
				enrichedTopRatedMovies
			] = await Promise.all([
				enrichWithLibraryStatus(trendingDay.results),
				enrichWithLibraryStatus(trendingWeek.results),
				enrichWithLibraryStatus(popularMovies.results, 'movie'),
				enrichWithLibraryStatus(popularTV.results, 'tv'),
				enrichWithLibraryStatus(topRatedMovies.results, 'movie')
			]);

			return {
				viewType: 'dashboard',
				tmdbConfigured: true,
				sections: {
					trendingDay: enrichedTrendingDay,
					trendingWeek: enrichedTrendingWeek,
					popularMovies: enrichedPopularMovies,
					popularTV: enrichedPopularTV,
					topRatedMovies: enrichedTopRatedMovies
				},
				providers,
				genres,
				filters: {
					type,
					sort_by: sortBy,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres
				}
			};
		} else {
			// Use shared logic
			const { results, pagination } = await getDiscoverResults({
				type,
				page,
				sortBy,
				withWatchProviders,
				watchRegion,
				withGenres,
				minDate,
				maxDate,
				minRating
			});

			// Enrich results with library status
			const mediaTypeFilter = type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : 'all';
			const enrichedResults = await enrichWithLibraryStatus(results, mediaTypeFilter);

			return {
				viewType: 'grid',
				tmdbConfigured: true,
				results: enrichedResults,
				pagination,
				providers,
				genres,
				filters: {
					type,
					sort_by: sortBy,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres
				}
			};
		}
	} catch (e) {
		logger.error('Discover load error', e, { type, sortBy });
		return {
			viewType: 'error',
			tmdbConfigured: true, // API key exists but request failed
			error: 'Failed to load content',
			providers: [],
			genres: [],
			filters: {
				type,
				sort_by: sortBy,
				with_watch_providers: withWatchProviders,
				with_genres: withGenres
			}
		};
	}
};
