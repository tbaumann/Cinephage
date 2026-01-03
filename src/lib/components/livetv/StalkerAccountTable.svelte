<script lang="ts">
	import {
		Settings,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Tv,
		FlaskConical,
		Loader2,
		RefreshCw
	} from 'lucide-svelte';
	import type { StalkerAccount } from '$lib/types/livetv';

	interface Props {
		accounts: StalkerAccount[];
		onEdit: (account: StalkerAccount) => void;
		onDelete: (account: StalkerAccount) => void;
		onToggle: (account: StalkerAccount) => void;
		onTest: (account: StalkerAccount) => Promise<void>;
		onSync?: (account: StalkerAccount) => Promise<void>;
		testingId?: string | null;
		syncingId?: string | null;
	}

	let {
		accounts,
		onEdit,
		onDelete,
		onToggle,
		onTest,
		onSync,
		testingId = null,
		syncingId = null
	}: Props = $props();

	function formatExpiry(dateStr: string | null | undefined): string {
		if (!dateStr) return 'Unknown';
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;

		const now = new Date();
		const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (daysUntil < 0) return 'Expired';
		if (daysUntil === 0) return 'Today';
		if (daysUntil === 1) return 'Tomorrow';
		if (daysUntil <= 30) return `${daysUntil} days`;

		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getExpiryClass(dateStr: string | null | undefined): string {
		if (!dateStr) return 'badge-ghost';
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return 'badge-ghost';

		const now = new Date();
		const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (daysUntil < 0) return 'badge-error';
		if (daysUntil <= 7) return 'badge-warning';
		return 'badge-success';
	}

	function formatLastSync(dateStr: string | null | undefined): string {
		if (!dateStr) return 'Never';
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;

		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / (1000 * 60));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days === 1) return 'Yesterday';
		if (days < 7) return `${days}d ago`;

		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

{#if accounts.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Tv class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No IPTV accounts configured</p>
		<p class="mt-1 text-sm">Add a Stalker Portal account to access live TV channels</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Portal</th>
					<th>Content</th>
					<th>Last Sync</th>
					<th>Expires</th>
					<th>Status</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each accounts as account (account.id)}
					<tr class="hover">
						<td>
							<div class="flex items-center gap-3">
								<div class="placeholder avatar">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-content"
									>
										<Tv class="h-5 w-5" />
									</div>
								</div>
								<div>
									<div class="font-bold">{account.name}</div>
									<div class="font-mono text-sm opacity-50">{account.macAddress}</div>
								</div>
							</div>
						</td>
						<td>
							<div class="max-w-xs truncate font-mono text-sm" title={account.portalUrl}>
								{account.portalUrl}
							</div>
						</td>
						<td>
							<div class="flex flex-col gap-1">
								<span class="badge badge-ghost badge-sm">
									{account.channelCount.toLocaleString()} channels
								</span>
								<span class="badge badge-outline badge-sm">
									{account.categoryCount} categories
								</span>
							</div>
						</td>
						<td>
							<div class="flex items-center gap-2">
								<span class="text-sm opacity-70">
									{formatLastSync(account.lastSyncAt)}
								</span>
								{#if onSync}
									<button
										class="btn btn-circle btn-ghost btn-xs"
										onclick={() => onSync(account)}
										title="Sync channels now"
										disabled={syncingId === account.id}
									>
										{#if syncingId === account.id}
											<Loader2 class="h-3 w-3 animate-spin" />
										{:else}
											<RefreshCw class="h-3 w-3" />
										{/if}
									</button>
								{/if}
							</div>
						</td>
						<td>
							<span class="badge badge-sm {getExpiryClass(account.accountInfo?.expDate)}">
								{formatExpiry(account.accountInfo?.expDate)}
							</span>
						</td>
						<td>
							<span class="badge {account.enabled ? 'badge-success' : 'badge-ghost'}">
								{account.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</td>
						<td>
							<div class="flex justify-end gap-1">
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onTest(account)}
									title="Test connection"
									disabled={testingId === account.id}
								>
									{#if testingId === account.id}
										<Loader2 class="h-4 w-4 animate-spin" />
									{:else}
										<FlaskConical class="h-4 w-4" />
									{/if}
								</button>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onToggle(account)}
									title={account.enabled ? 'Disable' : 'Enable'}
								>
									{#if account.enabled}
										<ToggleRight class="h-4 w-4 text-success" />
									{:else}
										<ToggleLeft class="h-4 w-4" />
									{/if}
								</button>
								<button class="btn btn-ghost btn-sm" onclick={() => onEdit(account)} title="Edit">
									<Settings class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-sm"
									onclick={() => onDelete(account)}
									title="Delete"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
