/**
 * ChannelCategoryService - Manages user-created categories for organizing channel lineup.
 * Provides CRUD operations and ordering for categories.
 */

import { db } from '$lib/server/db';
import {
	channelCategories,
	channelLineupItems,
	type ChannelCategoryRecord
} from '$lib/server/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { randomUUID } from 'crypto';
import type { ChannelCategory, ChannelCategoryFormData } from '$lib/types/livetv';

/**
 * Convert database record to API response format
 */
function toCategoryResponse(record: ChannelCategoryRecord): ChannelCategory {
	return {
		id: record.id,
		name: record.name,
		position: record.position,
		color: record.color,
		icon: record.icon,
		createdAt: record.createdAt || new Date().toISOString(),
		updatedAt: record.updatedAt || new Date().toISOString()
	};
}

class ChannelCategoryService {
	/**
	 * Get all categories ordered by position
	 */
	async getCategories(): Promise<ChannelCategory[]> {
		const categories = await db
			.select()
			.from(channelCategories)
			.orderBy(asc(channelCategories.position));

		return categories.map(toCategoryResponse);
	}

	/**
	 * Get a single category by ID
	 */
	async getCategoryById(id: string): Promise<ChannelCategory | null> {
		const categories = await db
			.select()
			.from(channelCategories)
			.where(eq(channelCategories.id, id))
			.limit(1);

		if (categories.length === 0) return null;
		return toCategoryResponse(categories[0]);
	}

	/**
	 * Get category count
	 */
	async getCategoryCount(): Promise<number> {
		const result = await db.select({ count: sql<number>`count(*)` }).from(channelCategories);
		return result[0]?.count || 0;
	}

	/**
	 * Get channel count for a category
	 */
	async getCategoryChannelCount(categoryId: string): Promise<number> {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(channelLineupItems)
			.where(eq(channelLineupItems.categoryId, categoryId));
		return result[0]?.count || 0;
	}

	/**
	 * Get all categories with their channel counts
	 */
	async getCategoriesWithCounts(): Promise<Array<ChannelCategory & { channelCount: number }>> {
		const categories = await this.getCategories();

		const results = await Promise.all(
			categories.map(async (category) => ({
				...category,
				channelCount: await this.getCategoryChannelCount(category.id)
			}))
		);

		return results;
	}

	/**
	 * Create a new category
	 */
	async createCategory(data: ChannelCategoryFormData): Promise<ChannelCategory> {
		const currentCount = await this.getCategoryCount();
		const now = new Date().toISOString();
		const id = randomUUID();

		await db.insert(channelCategories).values({
			id,
			name: data.name,
			position: currentCount + 1,
			color: data.color || null,
			icon: data.icon || null,
			createdAt: now,
			updatedAt: now
		});

		logger.info('[ChannelCategoryService] Created category', { id, name: data.name });

		return {
			id,
			name: data.name,
			position: currentCount + 1,
			color: data.color || null,
			icon: data.icon || null,
			createdAt: now,
			updatedAt: now
		};
	}

	/**
	 * Update a category
	 */
	async updateCategory(id: string, data: Partial<ChannelCategoryFormData>): Promise<void> {
		const now = new Date().toISOString();

		await db
			.update(channelCategories)
			.set({
				...(data.name !== undefined && { name: data.name }),
				...(data.color !== undefined && { color: data.color || null }),
				...(data.icon !== undefined && { icon: data.icon || null }),
				updatedAt: now
			})
			.where(eq(channelCategories.id, id));

		logger.info('[ChannelCategoryService] Updated category', { id });
	}

	/**
	 * Delete a category.
	 * Channels in this category will have their categoryId set to null (ON DELETE SET NULL).
	 */
	async deleteCategory(id: string): Promise<void> {
		await db.delete(channelCategories).where(eq(channelCategories.id, id));

		// Recompact positions after deletion
		await this.recompactPositions();

		logger.info('[ChannelCategoryService] Deleted category', { id });
	}

	/**
	 * Reorder categories.
	 * The categoryIds array represents the new order (first = position 1).
	 */
	async reorderCategories(categoryIds: string[]): Promise<void> {
		const now = new Date().toISOString();

		for (let i = 0; i < categoryIds.length; i++) {
			await db
				.update(channelCategories)
				.set({ position: i + 1, updatedAt: now })
				.where(eq(channelCategories.id, categoryIds[i]));
		}

		logger.info('[ChannelCategoryService] Reordered categories', {
			count: categoryIds.length
		});
	}

	/**
	 * Recompact positions to ensure sequential ordering (no gaps).
	 */
	private async recompactPositions(): Promise<void> {
		const categories = await db
			.select({ id: channelCategories.id })
			.from(channelCategories)
			.orderBy(asc(channelCategories.position));

		for (let i = 0; i < categories.length; i++) {
			await db
				.update(channelCategories)
				.set({ position: i + 1 })
				.where(eq(channelCategories.id, categories[i].id));
		}
	}
}

// Singleton instance
let instance: ChannelCategoryService | null = null;

export function getChannelCategoryService(): ChannelCategoryService {
	if (!instance) {
		instance = new ChannelCategoryService();
	}
	return instance;
}

export type { ChannelCategoryService };
