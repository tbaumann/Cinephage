import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm, truncate, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImportService } from './ImportService';

async function createTempDir() {
	return mkdtemp(join(tmpdir(), 'cinephage-import-'));
}

async function createSizedFile(filePath: string, sizeBytes: number) {
	await writeFile(filePath, '');
	await truncate(filePath, sizeBytes);
}

describe('ImportService NZB-Mount selection', () => {
	beforeEach(() => {
		ImportService.resetInstance();
	});

	it('prefers non-strm when present for NZB-Mount options', async () => {
		const dir = await createTempDir();
		try {
			const strmPath = join(dir, 'movie.strm');
			const mkvPath = join(dir, 'movie.mkv');

			await writeFile(strmPath, 'http://example.com/stream');
			await createSizedFile(mkvPath, 60 * 1024 * 1024);

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(dir, { allowStrmSmall: true, preferNonStrm: true });

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(mkvPath);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('allows small strm files when configured for NZB-Mount', async () => {
		const dir = await createTempDir();
		try {
			const strmPath = join(dir, 'movie.strm');
			await writeFile(strmPath, 'http://example.com/stream');

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(dir, { allowStrmSmall: true, preferNonStrm: true });

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(strmPath);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('rejects small strm files by default', async () => {
		const dir = await createTempDir();
		try {
			const strmPath = join(dir, 'movie.strm');
			await writeFile(strmPath, 'http://example.com/stream');

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(dir, { allowStrmSmall: false, preferNonStrm: false });

			expect(files).toHaveLength(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('includes symlinked video files when scanning import candidates', async () => {
		const sourceDir = await createTempDir();
		const downloadDir = await createTempDir();
		try {
			const targetPath = join(sourceDir, 'actual-video.mkv');
			const symlinkPath = join(downloadDir, 'linked-video.mkv');
			await createSizedFile(targetPath, 60 * 1024 * 1024);
			await symlink(targetPath, symlinkPath);

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(downloadDir, { allowStrmSmall: false, preferNonStrm: false });

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(symlinkPath);
		} finally {
			await rm(sourceDir, { recursive: true, force: true });
			await rm(downloadDir, { recursive: true, force: true });
		}
	});

	it('allows strm import when queue path is a direct .strm file', () => {
		const service = ImportService.getInstance() as unknown as {
			getImportOptions: (
				client?: { implementation?: string },
				queueItem?: { outputPath?: string | null; clientDownloadPath?: string | null }
			) => { allowStrmSmall: boolean; preferNonStrm: boolean };
		};

		const options = service.getImportOptions(undefined, {
			outputPath: '/mnt/nzbmount/completed/movie.strm',
			clientDownloadPath: null
		});

		expect(options.allowStrmSmall).toBe(true);
		expect(options.preferNonStrm).toBe(false);
	});
});

describe('ImportService metadata extraction', () => {
	beforeEach(() => {
		ImportService.resetInstance();
	});

	it('falls back to source filename metadata when queue title has no quality markers', () => {
		const service = ImportService.getInstance() as unknown as {
			buildImportedMetadata: (
				queueItem: {
					title: string;
					quality?: Record<string, string>;
					releaseGroup?: string | null;
				},
				sourcePath: string,
				mediaInfo: { width?: number; height?: number; videoCodec?: string } | null
			) => {
				sceneName: string;
				releaseGroup?: string;
				quality: {
					resolution?: string;
					source?: string;
					codec?: string;
					hdr?: string;
				};
			};
		};

		const metadata = service.buildImportedMetadata(
			{
				title: 'The Lord of the Rings The Fellowship of the Ring EXTENDED (2001)'
			},
			'/tmp/The.Lord.of.the.Rings.2001.720p.BRRip.x264-GRP.mkv',
			null
		);

		expect(metadata.sceneName).toBe('The.Lord.of.the.Rings.2001.720p.BRRip.x264-GRP');
		expect(metadata.releaseGroup).toBe('GRP');
		expect(metadata.quality.resolution).toBe('720p');
		expect(metadata.quality.source).toBe('bluray');
		expect(metadata.quality.codec).toBe('h264');
	});

	it('uses probe metadata as fallback for resolution and codec', () => {
		const service = ImportService.getInstance() as unknown as {
			buildImportedMetadata: (
				queueItem: {
					title: string;
					quality?: Record<string, string>;
					releaseGroup?: string | null;
				},
				sourcePath: string,
				mediaInfo: { width?: number; height?: number; videoCodec?: string } | null
			) => {
				sceneName: string;
				releaseGroup?: string;
				quality: {
					resolution?: string;
					source?: string;
					codec?: string;
					hdr?: string;
				};
			};
		};

		const metadata = service.buildImportedMetadata(
			{
				title: 'The Fellowship of the Ring'
			},
			'/tmp/The.Fellowship.of.the.Ring.mkv',
			{ width: 1920, height: 1080, videoCodec: 'HEVC' }
		);

		expect(metadata.quality.resolution).toBe('1080p');
		expect(metadata.quality.codec).toBe('h265');
	});
});
