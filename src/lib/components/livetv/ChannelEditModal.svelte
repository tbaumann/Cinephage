<script lang="ts">
	import { X, Loader2, Tv } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import type {
		ChannelLineupItemWithAccount,
		ChannelCategory,
		UpdateChannelRequest
	} from '$lib/types/livetv';

	interface Props {
		open: boolean;
		channel: ChannelLineupItemWithAccount | null;
		categories: ChannelCategory[];
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: UpdateChannelRequest) => void;
		onDelete?: () => void;
	}

	let {
		open,
		channel,
		categories,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete
	}: Props = $props();

	// Form state
	let channelNumber = $state<number | null>(null);
	let customName = $state('');
	let customLogo = $state('');
	let epgId = $state('');
	let categoryId = $state<string | null>(null);

	// Derived
	const isValid = $derived(true); // All fields are optional

	// Reset form when modal opens or channel changes
	$effect(() => {
		if (open && channel) {
			channelNumber = channel.channelNumber;
			customName = channel.customName || '';
			customLogo = channel.customLogo || '';
			epgId = channel.epgId || '';
			categoryId = channel.categoryId;
		}
	});

	function getFormData(): UpdateChannelRequest {
		return {
			channelNumber: channelNumber || null,
			customName: customName.trim() || null,
			customLogo: customLogo.trim() || null,
			epgId: epgId.trim() || null,
			categoryId
		};
	}

	function handleSave() {
		onSave(getFormData());
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleClearCustomName() {
		customName = '';
	}

	function handleClearCustomLogo() {
		customLogo = '';
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && channel}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-2xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<div class="flex items-center gap-3">
					{#if channel.displayLogo}
						<div class="avatar">
							<div class="h-10 w-10 rounded bg-base-200">
								<img src={channel.displayLogo} alt={channel.displayName} class="object-contain" />
							</div>
						</div>
					{:else}
						<div class="placeholder avatar">
							<div class="flex h-10 w-10 items-center justify-center rounded bg-base-300">
								<Tv class="h-5 w-5 opacity-40" />
							</div>
						</div>
					{/if}
					<div>
						<h3 class="text-lg font-bold">{channel.displayName}</h3>
						<p class="text-sm opacity-60">{channel.accountName}</p>
					</div>
				</div>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Two Column Form Layout -->
			<div class="grid grid-cols-2 gap-6">
				<!-- Left Column: Display Settings -->
				<div class="space-y-4">
					<SectionHeader title="Display Settings" />

					<!-- Custom Name -->
					<div class="form-control">
						<label class="label py-1" for="customName">
							<span class="label-text">Display Name</span>
							{#if customName}
								<button class="link-sm link link-primary" onclick={handleClearCustomName}>
									Reset
								</button>
							{/if}
						</label>
						<input
							id="customName"
							type="text"
							class="input-bordered input input-sm"
							bind:value={customName}
							placeholder={channel.cachedName}
							maxlength="100"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">
								Original: {channel.cachedName}
							</span>
						</div>
					</div>

					<!-- Custom Logo -->
					<div class="form-control">
						<label class="label py-1" for="customLogo">
							<span class="label-text">Logo URL</span>
							{#if customLogo}
								<button class="link-sm link link-primary" onclick={handleClearCustomLogo}>
									Reset
								</button>
							{/if}
						</label>
						<input
							id="customLogo"
							type="url"
							class="input-bordered input input-sm"
							bind:value={customLogo}
							placeholder={channel.cachedLogo || 'https://...'}
						/>
						{#if customLogo || channel.cachedLogo}
							<div class="mt-2 flex items-center gap-2">
								<span class="text-xs opacity-60">Preview:</span>
								<div class="avatar">
									<div class="h-8 w-8 rounded bg-base-200">
										<img
											src={customLogo || channel.cachedLogo}
											alt="Logo preview"
											class="object-contain"
											onerror={(e) => {
												const target = e.target as HTMLImageElement;
												target.style.display = 'none';
											}}
										/>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Right Column: Organization -->
				<div class="space-y-4">
					<SectionHeader title="Organization" />

					<!-- Channel Number -->
					<div class="form-control">
						<label class="label py-1" for="channelNumber">
							<span class="label-text">Channel Number</span>
						</label>
						<input
							id="channelNumber"
							type="number"
							class="input-bordered input input-sm"
							bind:value={channelNumber}
							placeholder="Auto"
							min="1"
							max="9999"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">For EPG matching and remote control</span>
						</div>
					</div>

					<!-- EPG ID -->
					<div class="form-control">
						<label class="label py-1" for="epgId">
							<span class="label-text">EPG ID</span>
						</label>
						<input
							id="epgId"
							type="text"
							class="input-bordered input input-sm font-mono"
							bind:value={epgId}
							placeholder={channel.cachedName}
							maxlength="100"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">XMLTV tvg-id for Jellyfin/Plex</span>
						</div>
					</div>

					<!-- Category -->
					<div class="form-control">
						<label class="label py-1" for="categoryId">
							<span class="label-text">Category</span>
						</label>
						<select
							id="categoryId"
							class="select-bordered select select-sm"
							bind:value={categoryId}
						>
							<option value={null}>Uncategorized</option>
							{#each categories as cat (cat.id)}
								<option value={cat.id}>
									{cat.name}
								</option>
							{/each}
						</select>
						<div class="label py-1">
							<span class="label-text-alt text-xs">Used as group-title in M3U export</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Error -->
			{#if error}
				<div class="mt-6 alert text-sm alert-error">
					{error}
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-action">
				{#if onDelete}
					<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>
						Remove from Lineup
					</button>
				{/if}
				<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				<button class="btn btn-primary" onclick={handleSave} disabled={saving || !isValid}>
					{#if saving}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Save Changes
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
