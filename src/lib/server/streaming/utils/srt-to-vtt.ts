/**
 * SRT to VTT Converter
 *
 * Converts SubRip (SRT) subtitle format to WebVTT (VTT) format.
 * VTT is the standard format for HLS subtitle tracks.
 */

/**
 * Convert SRT subtitle content to WebVTT format
 *
 * @param srt - SRT subtitle content
 * @returns VTT subtitle content
 */
export function convertSrtToVtt(srt: string): string {
	// Remove BOM if present
	let content = srt.replace(/^\uFEFF/, '');

	// Normalize line endings
	content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	// Convert SRT timestamps to VTT format
	// SRT: 00:00:00,000 --> 00:00:00,000
	// VTT: 00:00:00.000 --> 00:00:00.000
	content = content.replace(
		/(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
		'$1.$2 --> $3.$4'
	);

	// Remove numeric cue identifiers (optional in VTT, but keep for compatibility)
	// SRT has: number\ntimestamp\ntext
	// VTT allows: timestamp\ntext or identifier\ntimestamp\ntext
	// We keep the structure but ensure proper formatting

	// Add WEBVTT header
	return `WEBVTT\n\n${content.trim()}\n`;
}

/**
 * Detect if content is SRT format
 *
 * @param content - Subtitle content
 * @returns True if content appears to be SRT format
 */
export function isSrtFormat(content: string): boolean {
	// SRT files typically start with a number (cue index)
	// and contain timestamps with comma as decimal separator
	const trimmed = content.trim();

	// Check for SRT timestamp pattern
	const hasSrtTimestamp = /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed);

	// Check if it's NOT already VTT
	const isVtt = trimmed.startsWith('WEBVTT');

	return hasSrtTimestamp && !isVtt;
}

/**
 * Detect if content is VTT format
 *
 * @param content - Subtitle content
 * @returns True if content is WebVTT format
 */
export function isVttFormat(content: string): boolean {
	return content.trim().startsWith('WEBVTT');
}

/**
 * Ensure subtitle content is in VTT format
 * Converts from SRT if necessary
 *
 * @param content - Subtitle content (SRT or VTT)
 * @returns VTT subtitle content
 */
export function ensureVttFormat(content: string): string {
	if (isVttFormat(content)) {
		return content;
	}

	if (isSrtFormat(content)) {
		return convertSrtToVtt(content);
	}

	// Unknown format - wrap in VTT header anyway
	return `WEBVTT\n\n${content.trim()}\n`;
}
