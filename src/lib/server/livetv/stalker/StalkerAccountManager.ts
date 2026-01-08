/**
 * Stalker Account Manager
 *
 * Manages Stalker Portal accounts - CRUD operations, testing, and metadata refresh.
 * Follows the singleton manager pattern used by DownloadClientManager.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { stalkerAccounts, type StalkerAccountRecord } from '$lib/server/db/schema';
import { logger } from '$lib/logging';
import { StalkerPortalClient, type StalkerPortalConfig } from './StalkerPortalClient';
import type {
	StalkerAccount,
	StalkerAccountInput,
	StalkerAccountUpdate,
	StalkerAccountTestConfig,
	StalkerAccountTestResult
} from '$lib/types/livetv';

/**
 * Generate a random serial number (like MAG devices use)
 */
function generateSerialNumber(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let sn = '';
	for (let i = 0; i < 12; i++) {
		sn += chars[Math.floor(Math.random() * chars.length)];
	}
	return sn;
}

/**
 * Generate a random device ID (like MAG devices use)
 */
function generateDeviceId(): string {
	const chars = 'ABCDEF0123456789';
	let id = '';
	for (let i = 0; i < 32; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Convert database record to API response type
 */
function recordToAccount(record: StalkerAccountRecord): StalkerAccount {
	return {
		id: record.id,
		name: record.name,
		portalUrl: record.portalUrl,
		macAddress: record.macAddress,
		enabled: record.enabled ?? true,
		// Device parameters
		serialNumber: record.serialNumber ?? undefined,
		deviceId: record.deviceId ?? undefined,
		deviceId2: record.deviceId2 ?? undefined,
		model: record.model ?? 'MAG254',
		timezone: record.timezone ?? 'Europe/London',
		// Credentials (don't expose password)
		username: record.username ?? undefined,
		hasPassword: !!record.password,
		// Metadata from portal
		playbackLimit: record.playbackLimit,
		channelCount: record.channelCount,
		categoryCount: record.categoryCount,
		expiresAt: record.expiresAt,
		serverTimezone: record.serverTimezone,
		lastTestedAt: record.lastTestedAt,
		lastTestSuccess: record.lastTestSuccess,
		lastTestError: record.lastTestError,
		lastSyncAt: record.lastSyncAt,
		lastSyncError: record.lastSyncError,
		syncStatus: (record.syncStatus as StalkerAccount['syncStatus']) ?? 'never',
		createdAt: record.createdAt ?? new Date().toISOString(),
		updatedAt: record.updatedAt ?? new Date().toISOString()
	};
}

export class StalkerAccountManager {
	/**
	 * Get all Stalker accounts
	 */
	async getAccounts(): Promise<StalkerAccount[]> {
		const records = db.select().from(stalkerAccounts).all();
		return records.map(recordToAccount);
	}

	/**
	 * Get a Stalker account by ID
	 */
	async getAccount(id: string): Promise<StalkerAccount | null> {
		const record = db.select().from(stalkerAccounts).where(eq(stalkerAccounts.id, id)).get();

		if (!record) {
			return null;
		}

		return recordToAccount(record);
	}

	/**
	 * Create a new Stalker account
	 * Optionally tests the connection before saving
	 */
	async createAccount(
		input: StalkerAccountInput,
		testFirst: boolean = true
	): Promise<StalkerAccount> {
		const now = new Date().toISOString();

		// Generate device parameters if not provided
		const serialNumber = input.serialNumber || generateSerialNumber();
		const deviceId = input.deviceId || generateDeviceId();
		const deviceId2 = input.deviceId2 || generateDeviceId();
		const model = input.model || 'MAG254';
		const timezone = input.timezone || 'Europe/London';

		// Test connection if requested
		let testResult: StalkerAccountTestResult | null = null;
		let token: string | undefined;
		if (testFirst) {
			const testConfig: StalkerAccountTestConfig = {
				portalUrl: input.portalUrl,
				macAddress: input.macAddress,
				serialNumber,
				deviceId,
				deviceId2,
				model,
				timezone,
				username: input.username,
				password: input.password
			};

			const result = await this.testAccountConfig(testConfig);
			testResult = result.testResult;
			token = result.token;

			if (!testResult.success) {
				throw new Error(`Connection test failed: ${testResult.error}`);
			}
		}

		// Prepare insert data
		const insertData: typeof stalkerAccounts.$inferInsert = {
			name: input.name,
			portalUrl: input.portalUrl,
			macAddress: input.macAddress.toUpperCase(),
			enabled: input.enabled ?? true,
			// Device parameters
			serialNumber,
			deviceId,
			deviceId2,
			model,
			timezone,
			token,
			// Optional credentials
			username: input.username,
			password: input.password,
			createdAt: now,
			updatedAt: now
		};

		// Add test result metadata if available
		if (testResult?.success && testResult.profile) {
			insertData.playbackLimit = testResult.profile.playbackLimit;
			insertData.channelCount = testResult.profile.channelCount;
			insertData.categoryCount = testResult.profile.categoryCount;
			insertData.expiresAt = testResult.profile.expiresAt;
			insertData.serverTimezone = testResult.profile.serverTimezone;
			insertData.lastTestedAt = now;
			insertData.lastTestSuccess = true;
			insertData.lastTestError = null;
		}

		const record = db.insert(stalkerAccounts).values(insertData).returning().get();

		logger.info('[StalkerAccountManager] Created account', {
			id: record.id,
			name: record.name,
			portalUrl: record.portalUrl
		});

		return recordToAccount(record);
	}

	/**
	 * Update an existing Stalker account
	 */
	async updateAccount(id: string, updates: StalkerAccountUpdate): Promise<StalkerAccount | null> {
		const existing = await this.getAccount(id);
		if (!existing) {
			return null;
		}

		const now = new Date().toISOString();
		const updateData: Partial<typeof stalkerAccounts.$inferInsert> = {
			updatedAt: now
		};

		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}
		if (updates.portalUrl !== undefined) {
			updateData.portalUrl = updates.portalUrl;
		}
		if (updates.macAddress !== undefined) {
			updateData.macAddress = updates.macAddress.toUpperCase();
		}
		if (updates.enabled !== undefined) {
			updateData.enabled = updates.enabled;
		}
		// Device parameters
		if (updates.serialNumber !== undefined) {
			updateData.serialNumber = updates.serialNumber;
		}
		if (updates.deviceId !== undefined) {
			updateData.deviceId = updates.deviceId;
		}
		if (updates.deviceId2 !== undefined) {
			updateData.deviceId2 = updates.deviceId2;
		}
		if (updates.model !== undefined) {
			updateData.model = updates.model;
		}
		if (updates.timezone !== undefined) {
			updateData.timezone = updates.timezone;
		}
		// Credentials
		if (updates.username !== undefined) {
			updateData.username = updates.username;
		}
		if (updates.password !== undefined) {
			updateData.password = updates.password;
		}

		const record = db
			.update(stalkerAccounts)
			.set(updateData)
			.where(eq(stalkerAccounts.id, id))
			.returning()
			.get();

		if (!record) {
			return null;
		}

		logger.info('[StalkerAccountManager] Updated account', {
			id: record.id,
			name: record.name
		});

		return recordToAccount(record);
	}

	/**
	 * Update account token (used by streaming service when token changes)
	 */
	async updateAccountToken(id: string, token: string): Promise<void> {
		const now = new Date().toISOString();
		db.update(stalkerAccounts)
			.set({ token, updatedAt: now })
			.where(eq(stalkerAccounts.id, id))
			.run();
	}

	/**
	 * Delete a Stalker account
	 */
	async deleteAccount(id: string): Promise<boolean> {
		const existing = await this.getAccount(id);
		if (!existing) {
			return false;
		}

		db.delete(stalkerAccounts).where(eq(stalkerAccounts.id, id)).run();

		logger.info('[StalkerAccountManager] Deleted account', {
			id,
			name: existing.name
		});

		return true;
	}

	/**
	 * Build portal client config from test config
	 */
	private buildClientConfig(config: StalkerAccountTestConfig): StalkerPortalConfig {
		return {
			portalUrl: config.portalUrl,
			macAddress: config.macAddress,
			serialNumber: config.serialNumber || generateSerialNumber(),
			deviceId: config.deviceId || generateDeviceId(),
			deviceId2: config.deviceId2 || generateDeviceId(),
			model: config.model || 'MAG254',
			timezone: config.timezone || 'Europe/London',
			username: config.username,
			password: config.password
		};
	}

	/**
	 * Test a Stalker account configuration and return token
	 */
	private async testAccountConfig(
		config: StalkerAccountTestConfig
	): Promise<{ testResult: StalkerAccountTestResult; token?: string }> {
		const clientConfig = this.buildClientConfig(config);
		const client = new StalkerPortalClient(clientConfig);
		const testResult = await client.testConnection();
		return {
			testResult,
			token: client.isAuthenticated() ? client.getToken() : undefined
		};
	}

	/**
	 * Test a Stalker account configuration (without saving)
	 */
	async testAccount(config: StalkerAccountTestConfig): Promise<StalkerAccountTestResult> {
		const { testResult } = await this.testAccountConfig(config);
		return testResult;
	}

	/**
	 * Test an existing account by ID
	 */
	async testAccountById(id: string): Promise<StalkerAccountTestResult> {
		// Get the raw record to access all fields including credentials
		const record = db.select().from(stalkerAccounts).where(eq(stalkerAccounts.id, id)).get();
		if (!record) {
			return {
				success: false,
				error: 'Account not found'
			};
		}

		const config: StalkerAccountTestConfig = {
			portalUrl: record.portalUrl,
			macAddress: record.macAddress,
			serialNumber: record.serialNumber || undefined,
			deviceId: record.deviceId || undefined,
			deviceId2: record.deviceId2 || undefined,
			model: record.model || 'MAG254',
			timezone: record.timezone || 'Europe/London',
			username: record.username || undefined,
			password: record.password || undefined
		};

		const { testResult, token } = await this.testAccountConfig(config);

		// Update test results in database
		const now = new Date().toISOString();
		const updateData: Partial<typeof stalkerAccounts.$inferInsert> = {
			lastTestedAt: now,
			lastTestSuccess: testResult.success,
			lastTestError: testResult.error ?? null,
			updatedAt: now
		};

		// Update token if we got one
		if (token) {
			updateData.token = token;
		}

		// Update metadata if test succeeded
		if (testResult.success && testResult.profile) {
			updateData.playbackLimit = testResult.profile.playbackLimit;
			updateData.channelCount = testResult.profile.channelCount;
			updateData.categoryCount = testResult.profile.categoryCount;
			updateData.expiresAt = testResult.profile.expiresAt;
			updateData.serverTimezone = testResult.profile.serverTimezone;
		}

		db.update(stalkerAccounts).set(updateData).where(eq(stalkerAccounts.id, id)).run();

		return testResult;
	}

	/**
	 * Refresh metadata for an account (re-fetch from portal)
	 */
	async refreshAccountMetadata(id: string): Promise<StalkerAccount | null> {
		const result = await this.testAccountById(id);

		if (!result.success) {
			logger.warn('[StalkerAccountManager] Failed to refresh metadata', {
				id,
				error: result.error
			});
		}

		return this.getAccount(id);
	}

	/**
	 * Get accounts that are enabled
	 */
	async getEnabledAccounts(): Promise<StalkerAccount[]> {
		const records = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.enabled, true))
			.all();

		return records.map(recordToAccount);
	}
}

// Singleton instance
let managerInstance: StalkerAccountManager | null = null;

/**
 * Get the singleton StalkerAccountManager instance
 */
export function getStalkerAccountManager(): StalkerAccountManager {
	if (!managerInstance) {
		managerInstance = new StalkerAccountManager();
	}
	return managerInstance;
}
