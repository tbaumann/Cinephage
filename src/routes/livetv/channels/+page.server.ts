import type { PageServerLoad } from './$types';
import { getStalkerPortalManager } from '$lib/server/livetv/stalker/StalkerPortalManager';
import { getChannelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { getChannelCategoryService } from '$lib/server/livetv/categories/ChannelCategoryService';
import type {
	StalkerChannelWithAccount,
	StalkerAccount,
	ChannelLineupItemWithAccount,
	ChannelCategory
} from '$lib/types/livetv';
import { logger } from '$lib/logging';

interface CategoryWithCount extends ChannelCategory {
	channelCount: number;
}

interface PortalCategoryOption {
	id: string;
	title: string;
	accountId: string;
	accountName: string;
}

export interface ChannelsPageData {
	mode: 'lineup' | 'browse';
	// Browse mode data
	channels: StalkerChannelWithAccount[];
	total: number;
	totalUnfiltered: number;
	accounts: StalkerAccount[];
	portalCategories: PortalCategoryOption[];
	lineupKeys: string[];
	// Lineup mode data
	lineup: ChannelLineupItemWithAccount[];
	channelCategories: CategoryWithCount[];
	// Current filter state
	filters: {
		sort: string;
		account: string;
		category: string;
		search: string;
		lineupStatus: string;
	};
}

export const load: PageServerLoad = async ({ url }): Promise<ChannelsPageData> => {
	const mode = (url.searchParams.get('mode') || 'lineup') as 'lineup' | 'browse';

	// Parse filter params
	const sort = url.searchParams.get('sort') || 'number-asc';
	const account = url.searchParams.get('account') || 'all';
	const category = url.searchParams.get('category') || 'all';
	const search = url.searchParams.get('search') || '';
	const lineupStatus = url.searchParams.get('lineupStatus') || 'all';

	const portalManager = getStalkerPortalManager();
	const lineupService = getChannelLineupService();
	const categoryService = getChannelCategoryService();

	try {
		// Always fetch these (needed for both modes)
		const [accounts, lineup, lineupKeysSet, channelCategories] = await Promise.all([
			portalManager.getAccounts(),
			lineupService.getLineup(),
			lineupService.getLineupChannelKeys(),
			categoryService.getCategoriesWithCounts()
		]);

		const lineupKeys = Array.from(lineupKeysSet);

		// For lineup mode, we don't need to fetch all channels
		if (mode === 'lineup') {
			return {
				mode,
				channels: [],
				total: 0,
				totalUnfiltered: 0,
				accounts: accounts as StalkerAccount[],
				portalCategories: [],
				lineupKeys,
				lineup,
				channelCategories,
				filters: { sort, account, category, search, lineupStatus }
			};
		}

		// Browse mode: fetch all channels from all enabled accounts
		const [allChannels, allCategories] = await Promise.all([
			portalManager.getAllChannels(),
			portalManager.getAllCategories()
		]);

		// Build unique portal categories for filter dropdown
		const portalCategoryMap = new Map<string, PortalCategoryOption>();
		for (const cat of allCategories) {
			const key = `${cat.accountId}:${cat.id}`;
			if (!portalCategoryMap.has(key)) {
				portalCategoryMap.set(key, {
					id: cat.id,
					title: cat.title,
					accountId: cat.accountId,
					accountName: cat.accountName
				});
			}
		}
		const portalCategories = Array.from(portalCategoryMap.values()).sort((a, b) =>
			a.title.localeCompare(b.title)
		);

		const totalUnfiltered = allChannels.length;

		// Apply filters
		let filteredChannels = allChannels;

		// Filter by account
		if (account !== 'all') {
			filteredChannels = filteredChannels.filter((ch) => ch.accountId === account);
		}

		// Filter by category
		if (category !== 'all') {
			filteredChannels = filteredChannels.filter((ch) => ch.categoryId === category);
		}

		// Filter by search
		if (search.trim()) {
			const searchLower = search.toLowerCase().trim();
			filteredChannels = filteredChannels.filter(
				(ch) =>
					ch.name.toLowerCase().includes(searchLower) ||
					ch.xmltvId?.toLowerCase().includes(searchLower) ||
					ch.categoryName?.toLowerCase().includes(searchLower)
			);
		}

		// Filter by lineup status
		if (lineupStatus === 'inLineup') {
			filteredChannels = filteredChannels.filter((ch) =>
				lineupKeysSet.has(`${ch.accountId}:${ch.id}`)
			);
		} else if (lineupStatus === 'notInLineup') {
			filteredChannels = filteredChannels.filter(
				(ch) => !lineupKeysSet.has(`${ch.accountId}:${ch.id}`)
			);
		}

		// Apply sorting
		const [sortField, sortDir] = sort.split('-') as [string, 'asc' | 'desc'];
		filteredChannels.sort((a, b) => {
			let comparison = 0;

			switch (sortField) {
				case 'number':
					comparison = (a.number || 0) - (b.number || 0);
					break;
				case 'name':
					comparison = (a.name || '').localeCompare(b.name || '');
					break;
				case 'category':
					comparison = (a.categoryName || '').localeCompare(b.categoryName || '');
					if (comparison === 0) {
						comparison = (a.name || '').localeCompare(b.name || '');
					}
					break;
				case 'account':
					comparison = (a.accountName || '').localeCompare(b.accountName || '');
					if (comparison === 0) {
						comparison = (a.number || 0) - (b.number || 0);
					}
					break;
				default:
					comparison = (a.number || 0) - (b.number || 0);
			}

			return sortDir === 'desc' ? -comparison : comparison;
		});

		return {
			mode,
			channels: filteredChannels,
			total: filteredChannels.length,
			totalUnfiltered,
			accounts: accounts as StalkerAccount[],
			portalCategories,
			lineupKeys,
			lineup,
			channelCategories,
			filters: { sort, account, category, search, lineupStatus }
		};
	} catch (error) {
		logger.error('[Channels Page] Error loading data', error instanceof Error ? error : undefined);

		return {
			mode,
			channels: [],
			total: 0,
			totalUnfiltered: 0,
			accounts: [],
			portalCategories: [],
			lineupKeys: [],
			lineup: [],
			channelCategories: [],
			filters: { sort, account, category, search, lineupStatus }
		};
	}
};
