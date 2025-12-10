/**
 * Streaming Module Constants
 *
 * Centralized configuration values for the streaming system.
 * These can be overridden via environment variables where applicable.
 */

// =============================================================================
// Cache Configuration
// =============================================================================

/** Stream cache TTL in milliseconds (15 minutes) */
export const STREAM_CACHE_TTL_MS = 15 * 60 * 1000;

/** Stream cache maximum size (number of entries) */
export const STREAM_CACHE_MAX_SIZE = 500;

/** TMDB cache TTL in milliseconds (24 hours) */
export const TMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** TMDB cache maximum size (number of entries) */
export const TMDB_CACHE_MAX_SIZE = 1000;

// =============================================================================
// HTTP Request Configuration
// =============================================================================

/** Default timeout for HTTP requests in milliseconds */
export const DEFAULT_TIMEOUT_MS = 15000;

/** Short timeout for availability checks in milliseconds */
export const AVAILABILITY_CHECK_TIMEOUT_MS = 5000;

/** MoviesAPI request timeout in milliseconds */
export const MOVIESAPI_TIMEOUT_MS = 12000;

/** Default User-Agent for HTTP requests */
export const DEFAULT_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// =============================================================================
// Streaming Release Configuration
// =============================================================================

/**
 * Fixed score for streaming releases.
 * Kept low (10) to ensure they can be upgraded to torrent releases.
 */
export const STREAMING_RELEASE_SCORE = 10;

/**
 * Placeholder size for streaming releases in bytes (1KB).
 * Used since streaming has no actual file size.
 */
export const STREAMING_PLACEHOLDER_SIZE = 1024;

/**
 * Placeholder size for season pack streaming releases in bytes (10KB).
 */
export const STREAMING_SEASON_PACK_SIZE = 10 * 1024;

// =============================================================================
// Proxy Configuration
// =============================================================================

/** Cache max-age for HLS playlists in seconds (5 minutes) */
export const PLAYLIST_CACHE_MAX_AGE = 300;

/** Cache max-age for HLS segments in seconds (1 hour) */
export const SEGMENT_CACHE_MAX_AGE = 3600;

/** Proxy fetch timeout in milliseconds (default 30s) */
export const PROXY_FETCH_TIMEOUT_MS = parseInt(process.env.PROXY_FETCH_TIMEOUT_MS || '30000', 10);

/** Maximum segment size in bytes (default 50MB) */
export const PROXY_SEGMENT_MAX_SIZE = parseInt(
	process.env.PROXY_SEGMENT_MAX_SIZE || String(50 * 1024 * 1024),
	10
);

/** Maximum retry attempts for proxy fetches on 5xx errors */
export const PROXY_MAX_RETRIES = parseInt(process.env.PROXY_MAX_RETRIES || '2', 10);

/** Default referer for proxy requests */
export const DEFAULT_PROXY_REFERER = process.env.DEFAULT_PROXY_REFERER || 'https://videasy.net';

/** Referer mappings for different stream domains */
export const PROXY_REFERER_MAP: Record<string, string> = {
	vidlink: 'https://vidlink.pro',
	vidsrc: 'https://vidsrc.to',
	videasy: 'https://videasy.net',
	hexa: 'https://hexawatch.to',
	smashystream: 'https://smashystream.top',
	xprime: 'https://xprime.tv'
};

// =============================================================================
// EncDec API Configuration
// =============================================================================

/** EncDec API base URL */
export const ENC_DEC_API_URL = 'https://enc-dec.app/api';

/** EncDec API request timeout in milliseconds */
export const ENC_DEC_TIMEOUT_MS = 10000;

/** Maximum retries for EncDec API requests */
export const ENC_DEC_RETRIES = 3;

// =============================================================================
// Provider Configuration
// =============================================================================

/** Default timeout for provider extraction in milliseconds */
export const PROVIDER_DEFAULT_TIMEOUT_MS = 15000;

/** Quick timeout for simpler providers in milliseconds */
export const PROVIDER_QUICK_TIMEOUT_MS = 8000;

// =============================================================================
// Circuit Breaker Configuration
// =============================================================================

/** Maximum consecutive failures before circuit opens */
export const CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.PROVIDER_MAX_FAILURES || '3', 10);

/** Time in milliseconds before circuit breaker enters half-open state */
export const CIRCUIT_BREAKER_HALF_OPEN_MS = parseInt(
	process.env.PROVIDER_CIRCUIT_HALF_OPEN_MS || '30000',
	10
);

/** Time in milliseconds before circuit breaker fully resets */
export const CIRCUIT_BREAKER_RESET_MS = parseInt(
	process.env.PROVIDER_CIRCUIT_RESET_MS || '60000',
	10
);

/** TTL for provider result cache entries in milliseconds */
export const PROVIDER_RESULT_CACHE_TTL_MS = parseInt(
	process.env.PROVIDER_CACHE_TTL_MS || '30000',
	10
);

/** Number of providers to try in parallel mode */
export const PROVIDER_PARALLEL_COUNT = parseInt(process.env.PROVIDER_PARALLEL_COUNT || '3', 10);

// =============================================================================
// Legacy Provider Configuration (Deprecated)
// =============================================================================

/** @deprecated Use EncDec providers instead */
export const DEFAULT_MOVIESAPI_URL = 'https://w1.moviesapi.to/api/scrapify';

/** @deprecated Use EncDec providers instead */
export const DEFAULT_MOVIESAPI_ENCRYPTION_KEY = 'moviesapi-secure-encryption-key-2024-v1';

/** @deprecated Use EncDec providers instead */
export const DEFAULT_MOVIESAPI_PLAYER_KEY = 'moviesapi-player-auth-key-2024-secure';

/** @deprecated Use EncDec providers instead */
export const VIDSRC_STREAM_DOMAIN = 'shadowlandschronicles.com';

// =============================================================================
// AniList API Configuration
// =============================================================================

/** AniList GraphQL API endpoint */
export const ANILIST_API_URL = 'https://graphql.anilist.co';

/** AniList API request timeout in milliseconds */
export const ANILIST_TIMEOUT_MS = 10000;

/** Cache TTL for successful AniList lookups (30 days) */
export const ANILIST_CACHE_TTL_SUCCESS_MS = 30 * 24 * 60 * 60 * 1000;

/** Cache TTL for failed AniList lookups (24 hours) */
export const ANILIST_CACHE_TTL_FAILURE_MS = 24 * 60 * 60 * 1000;

/** Maximum AniList cache entries */
export const ANILIST_CACHE_MAX_SIZE = 1000;

/** Minimum confidence threshold for AniList matches */
export const ANILIST_MIN_CONFIDENCE = 0.6;
