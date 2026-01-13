/**
 * Utility functions for monitoring specifications
 */

import type { ReleaseAttributes } from '$lib/server/scoring/types.js';
import { parseRelease } from '$lib/server/scoring/scorer.js';

/**
 * Stored quality data structure from the database
 */
export interface StoredQuality {
	resolution?: string;
	source?: string;
	codec?: string;
	hdr?: string;
}

/**
 * File record with quality data
 */
export interface ExistingFileRecord {
	sceneName?: string | null;
	relativePath: string;
	quality?: StoredQuality | null;
	releaseGroup?: string | null;
}

/**
 * Build ReleaseAttributes from an existing file record.
 *
 * Priority:
 * 1. If stored quality has meaningful data, build attributes from sceneName
 *    and override with stored quality values
 * 2. Otherwise, return undefined to let scorer parse the filename
 *
 * @param existingFile - File record from database
 * @returns ReleaseAttributes if quality data available, undefined otherwise
 */
export function buildExistingAttrs(
	existingFile: ExistingFileRecord
): ReleaseAttributes | undefined {
	const quality = existingFile.quality;
	const sceneName = existingFile.sceneName || existingFile.relativePath;

	// Check if we have any stored quality data
	const hasStoredQuality =
		quality && (quality.resolution || quality.source || quality.codec || quality.hdr);

	if (!hasStoredQuality) {
		// No stored quality - let the scorer parse the filename
		return undefined;
	}

	// Parse the sceneName to get base attributes
	const attrs = parseRelease(sceneName);

	// Override with stored quality values (they are more reliable since they
	// were parsed when the file was first imported with the original release name)
	if (quality.resolution) {
		attrs.resolution = quality.resolution as ReleaseAttributes['resolution'];
	}
	if (quality.source) {
		attrs.source = quality.source as ReleaseAttributes['source'];
	}
	if (quality.codec) {
		attrs.codec = quality.codec as ReleaseAttributes['codec'];
	}
	if (quality.hdr) {
		attrs.hdr = quality.hdr as ReleaseAttributes['hdr'];
	}

	// Use stored release group if available
	if (existingFile.releaseGroup) {
		attrs.releaseGroup = existingFile.releaseGroup;
	}

	return attrs;
}
