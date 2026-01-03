<script lang="ts">
	import { X, Loader2, XCircle, CheckCircle2 } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import type { StalkerAccount, StalkerAccountTestResult } from '$lib/types/livetv';

	interface FormData {
		name: string;
		portalUrl: string;
		macAddress: string;
		enabled: boolean;
		priority: number;
	}

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		account?: StalkerAccount | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: FormData) => void;
		onDelete?: () => void;
		onTest: (data: { portalUrl: string; macAddress: string }) => Promise<StalkerAccountTestResult>;
	}

	let {
		open,
		mode,
		account = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Form state
	let name = $state('');
	let portalUrl = $state('');
	let macAddress = $state('');
	let enabled = $state(true);
	let priority = $state(1);

	// UI state
	let testing = $state(false);
	let testResult = $state<StalkerAccountTestResult | null>(null);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add IPTV Account' : 'Edit IPTV Account');
	const isValid = $derived(name.trim() && portalUrl.trim() && macAddress.trim());

	// Reset form when modal opens or account changes
	$effect(() => {
		if (open) {
			name = account?.name ?? '';
			portalUrl = account?.portalUrl ?? '';
			macAddress = account?.macAddress ?? '';
			enabled = account?.enabled ?? true;
			priority = account?.priority ?? 1;
			testResult = null;
		}
	});

	// Format MAC address as user types
	function formatMacAddress(value: string): string {
		// Remove all non-hex characters
		const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
		// Insert colons every 2 characters
		const parts = hex.match(/.{1,2}/g) || [];
		return parts.slice(0, 6).join(':');
	}

	function handleMacInput(e: Event) {
		const input = e.target as HTMLInputElement;
		macAddress = formatMacAddress(input.value);
	}

	function getFormData(): FormData {
		return {
			name,
			portalUrl: portalUrl.trim(),
			macAddress: macAddress.toUpperCase(),
			enabled,
			priority
		};
	}

	async function handleTest() {
		testing = true;
		testResult = null;
		try {
			testResult = await onTest({
				portalUrl: portalUrl.trim(),
				macAddress: macAddress.toUpperCase()
			});
		} finally {
			testing = false;
		}
	}

	function handleSave() {
		onSave(getFormData());
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// Format expiry date for display
	function formatExpiry(dateStr: string | null | undefined): string {
		if (!dateStr) return 'Unknown';
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-2xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">{modalTitle}</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Main Form - Two Column Layout -->
			<div class="grid grid-cols-2 gap-6">
				<!-- Left Column: Connection -->
				<div class="space-y-4">
					<SectionHeader title="Connection" />

					<div class="form-control">
						<label class="label py-1" for="name">
							<span class="label-text">Name</span>
						</label>
						<input
							id="name"
							type="text"
							class="input-bordered input input-sm"
							bind:value={name}
							placeholder="My IPTV Account"
						/>
					</div>

					<div class="form-control">
						<label class="label py-1" for="portalUrl">
							<span class="label-text">Portal URL</span>
						</label>
						<input
							id="portalUrl"
							type="url"
							class="input-bordered input input-sm"
							bind:value={portalUrl}
							placeholder="http://portal.example.com/c"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">
								Full URL to the Stalker Portal (usually ends with /c or /c/)
							</span>
						</div>
					</div>

					<div class="form-control">
						<label class="label py-1" for="macAddress">
							<span class="label-text">MAC Address</span>
						</label>
						<input
							id="macAddress"
							type="text"
							class="input-bordered input input-sm font-mono"
							value={macAddress}
							oninput={handleMacInput}
							placeholder="00:1A:79:XX:XX:XX"
							maxlength="17"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">Format: 00:1A:79:XX:XX:XX</span>
						</div>
					</div>
				</div>

				<!-- Right Column: Settings & Account Info -->
				<div class="space-y-4">
					<SectionHeader title="Settings" />

					<div class="form-control">
						<label class="label py-1" for="priority">
							<span class="label-text">Priority</span>
						</label>
						<input
							id="priority"
							type="number"
							class="input-bordered input input-sm"
							bind:value={priority}
							min="0"
							max="99"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">Lower values = higher priority</span>
						</div>
					</div>

					<div class="flex gap-4">
						<label class="label cursor-pointer gap-2">
							<input type="checkbox" class="checkbox checkbox-sm" bind:checked={enabled} />
							<span class="label-text">Enabled</span>
						</label>
					</div>

					<!-- Account Info (from test or existing data) -->
					{#if account?.accountInfo || testResult?.accountInfo}
						{@const info = testResult?.accountInfo || account?.accountInfo}
						{@const stats = testResult?.contentStats}
						<SectionHeader title="Account Info" />
						<div class="rounded-box bg-base-200 p-3 text-sm">
							<div class="grid grid-cols-2 gap-2">
								<div class="opacity-70">Status:</div>
								<div>
									{#if info?.status === 'active'}
										<span class="badge badge-sm badge-success">Active</span>
									{:else}
										<span class="badge badge-sm badge-error">{info?.status || 'Unknown'}</span>
									{/if}
								</div>
								<div class="opacity-70">Expires:</div>
								<div>{formatExpiry(info?.expDate)}</div>
								{#if info?.maxConnections}
									<div class="opacity-70">Max Connections:</div>
									<div>{info.maxConnections}</div>
								{/if}
								{#if stats}
									<div class="opacity-70">Live Channels:</div>
									<div>{stats.liveChannels.toLocaleString()}</div>
									<div class="opacity-70">Categories:</div>
									<div>{stats.liveCategories}</div>
									<div class="opacity-70">VOD Items:</div>
									<div>{stats.vodItems.toLocaleString()}</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Save Error -->
			{#if error}
				<div class="mt-6 alert alert-error">
					<XCircle class="h-5 w-5" />
					<div>
						<div class="font-medium">Failed to save</div>
						<div class="text-sm opacity-80">{error}</div>
					</div>
				</div>
			{/if}

			<!-- Test Result -->
			{#if testResult}
				<div class="mt-6">
					{#if testResult.success}
						<div class="alert alert-success">
							<CheckCircle2 class="h-5 w-5" />
							<div>
								<div class="font-medium">Connection successful</div>
								{#if testResult.accountInfo?.expDate}
									<div class="text-sm opacity-80">
										Account expires: {formatExpiry(testResult.accountInfo.expDate)}
									</div>
								{/if}
							</div>
						</div>
					{:else}
						<div class="alert alert-error">
							<XCircle class="h-5 w-5" />
							<div>
								<div class="font-medium">Connection failed</div>
								<div class="text-sm opacity-80">{testResult.error || 'Unknown error'}</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-action">
				{#if mode === 'edit' && onDelete}
					<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
				{/if}

				<button
					class="btn btn-ghost"
					onclick={handleTest}
					disabled={testing || saving || !portalUrl || !macAddress}
				>
					{#if testing}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Test
				</button>

				<button class="btn btn-ghost" onclick={onClose}>Cancel</button>

				<button class="btn btn-primary" onclick={handleSave} disabled={saving || !isValid}>
					{#if saving}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Save
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
