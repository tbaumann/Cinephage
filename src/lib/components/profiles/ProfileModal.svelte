<script lang="ts">
	import type { ScoringProfile, ScoringProfileFormData } from '$lib/types/profile';
	import { X, Save, Info, Loader2 } from 'lucide-svelte';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit' | 'view';
		profile?: ScoringProfile | null;
		baseProfiles: { id: string; name: string }[];
		defaultBaseProfileId?: string;
		saving?: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: ScoringProfileFormData) => void;
	}

	let {
		open,
		mode,
		profile = null,
		baseProfiles,
		defaultBaseProfileId = 'efficient',
		saving = false,
		error = null,
		onClose,
		onSave
	}: Props = $props();

	// Form state
	let name = $state('');
	let description = $state('');
	let baseProfileId = $state<string | null>(null);
	let upgradesAllowed = $state(true);
	// Media-specific size limits
	let movieMinSizeGb = $state('');
	let movieMaxSizeGb = $state('');
	let episodeMinSizeMb = $state('');
	let episodeMaxSizeMb = $state('');
	let isDefault = $state(false);

	// Initialize form when profile changes
	$effect(() => {
		if (open) {
			if (profile) {
				name = profile.name;
				description = profile.description || '';
				baseProfileId = profile.baseProfileId || null;
				upgradesAllowed = profile.upgradesAllowed;
				movieMinSizeGb = profile.movieMinSizeGb || '';
				movieMaxSizeGb = profile.movieMaxSizeGb || '';
				episodeMinSizeMb = profile.episodeMinSizeMb || '';
				episodeMaxSizeMb = profile.episodeMaxSizeMb || '';
				isDefault = profile.isDefault;
			} else {
				// Reset form for new profile - use provided default
				name = '';
				description = '';
				baseProfileId = defaultBaseProfileId;
				upgradesAllowed = true;
				movieMinSizeGb = '';
				movieMaxSizeGb = '';
				episodeMinSizeMb = '';
				episodeMaxSizeMb = '';
				isDefault = false;
			}
		}
	});

	function handleSave() {
		onSave({
			name,
			description: description || undefined,
			baseProfileId,
			upgradesAllowed,
			movieMinSizeGb: movieMinSizeGb || null,
			movieMaxSizeGb: movieMaxSizeGb || null,
			episodeMinSizeMb: episodeMinSizeMb || null,
			episodeMaxSizeMb: episodeMaxSizeMb || null,
			isDefault
		});
	}

	const isCoreReadonly = $derived(mode === 'view' || (profile?.isBuiltIn ?? false));
	const isFullyReadonly = $derived(mode === 'view');
	const modalTitle = $derived(
		mode === 'add' ? 'Create Profile' : profile?.isBuiltIn ? 'Edit Size Limits' : 'Edit Profile'
	);
</script>

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-lg overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">{modalTitle}</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if error}
				<div class="mb-4 alert alert-error">
					<span>{error}</span>
				</div>
			{/if}

			<div class="space-y-4">
				<!-- Name -->
				<div class="form-control">
					<label class="label" for="profile-name">
						<span class="label-text">Name</span>
					</label>
					<input
						id="profile-name"
						type="text"
						class="input-bordered input input-sm"
						bind:value={name}
						disabled={isCoreReadonly}
						placeholder="My Custom Profile"
					/>
				</div>

				<!-- Description -->
				<div class="form-control">
					<label class="label" for="profile-description">
						<span class="label-text">Description</span>
					</label>
					<textarea
						id="profile-description"
						class="textarea-bordered textarea h-20 textarea-sm"
						bind:value={description}
						disabled={isCoreReadonly}
						placeholder="Describe what this profile is for..."
					></textarea>
				</div>

				<!-- Base Profile -->
				<div class="form-control">
					<label class="label" for="base-profile">
						<span class="label-text">Base Profile</span>
						<span class="label-text-alt">
							<div class="tooltip" data-tip="Use scoring from an existing profile">
								<Info class="h-4 w-4" />
							</div>
						</span>
					</label>
					<select
						id="base-profile"
						class="select-bordered select select-sm"
						bind:value={baseProfileId}
						disabled={isCoreReadonly}
					>
						<option value={null}>None (Custom)</option>
						{#each baseProfiles as bp (bp.id)}
							<option value={bp.id}>{bp.name}</option>
						{/each}
					</select>
				</div>

				<!-- Movie Size Limits -->
				<div class="divider">Movie Size Limits</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="form-control">
						<label class="label" for="movie-min-size">
							<span class="label-text">Minimum Size (GB)</span>
						</label>
						<input
							id="movie-min-size"
							type="number"
							step="0.1"
							min="0"
							class="input-bordered input input-sm"
							bind:value={movieMinSizeGb}
							disabled={isFullyReadonly}
							placeholder="No minimum"
						/>
					</div>

					<div class="form-control">
						<label class="label" for="movie-max-size">
							<span class="label-text">Maximum Size (GB)</span>
						</label>
						<input
							id="movie-max-size"
							type="number"
							step="0.1"
							min="0"
							class="input-bordered input input-sm"
							bind:value={movieMaxSizeGb}
							disabled={isFullyReadonly}
							placeholder="No maximum"
						/>
					</div>
				</div>

				<!-- TV Episode Size Limits -->
				<div class="divider">TV Episode Size Limits</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="form-control">
						<label class="label" for="episode-min-size">
							<span class="label-text">Min per Episode (MB)</span>
						</label>
						<input
							id="episode-min-size"
							type="number"
							step="10"
							min="0"
							class="input-bordered input input-sm"
							bind:value={episodeMinSizeMb}
							disabled={isFullyReadonly}
							placeholder="No minimum"
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/60">
								{episodeMinSizeMb ? `≈ ${(Number(episodeMinSizeMb) / 1024).toFixed(2)} GB` : ''}
							</span>
						</div>
					</div>

					<div class="form-control">
						<label class="label" for="episode-max-size">
							<span class="label-text">Max per Episode (MB)</span>
						</label>
						<input
							id="episode-max-size"
							type="number"
							step="10"
							min="0"
							class="input-bordered input input-sm"
							bind:value={episodeMaxSizeMb}
							disabled={isFullyReadonly}
							placeholder="No maximum"
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/60">
								{episodeMaxSizeMb ? `≈ ${(Number(episodeMaxSizeMb) / 1024).toFixed(2)} GB` : ''}
							</span>
						</div>
					</div>
				</div>

				<div class="alert bg-base-200 text-sm">
					<Info class="h-4 w-4" />
					<span>
						For season packs, the average size per episode is calculated. Season packs with unknown
						episode counts will be rejected.
					</span>
				</div>

				<!-- Upgrades Allowed -->
				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-4">
						<input
							type="checkbox"
							class="checkbox"
							bind:checked={upgradesAllowed}
							disabled={isCoreReadonly}
						/>
						<div>
							<span class="label-text">Allow Upgrades</span>
							<p class="text-xs text-base-content/60">
								Replace existing files with higher-scoring releases
							</p>
						</div>
					</label>
				</div>

				<!-- Default -->
				{#if !profile?.isBuiltIn}
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input
								type="checkbox"
								class="checkbox"
								bind:checked={isDefault}
								disabled={isFullyReadonly}
							/>
							<div>
								<span class="label-text">Set as Default</span>
								<p class="text-xs text-base-content/60">
									Use this profile for new movies and shows
								</p>
							</div>
						</label>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-action mt-6 border-t border-base-300 pt-4">
				<button class="btn btn-ghost" onclick={onClose}>
					{isFullyReadonly ? 'Close' : 'Cancel'}
				</button>
				{#if !isFullyReadonly}
					<button class="btn gap-2 btn-primary" onclick={handleSave} disabled={saving || !name}>
						{#if saving}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Save class="h-4 w-4" />
						{/if}
						Save
					</button>
				{/if}
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
