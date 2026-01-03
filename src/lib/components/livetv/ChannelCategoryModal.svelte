<script lang="ts">
	import { X, Loader2 } from 'lucide-svelte';
	import type { ChannelCategory, ChannelCategoryFormData } from '$lib/types/livetv';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		category?: ChannelCategory | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: ChannelCategoryFormData) => void;
		onDelete?: () => void;
	}

	let {
		open,
		mode,
		category = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete
	}: Props = $props();

	// Form state
	let name = $state('');
	let color = $state('#6366f1'); // Default indigo

	// Preset colors for quick selection
	const presetColors = [
		'#ef4444', // red
		'#f97316', // orange
		'#f59e0b', // amber
		'#eab308', // yellow
		'#84cc16', // lime
		'#22c55e', // green
		'#14b8a6', // teal
		'#06b6d4', // cyan
		'#3b82f6', // blue
		'#6366f1', // indigo
		'#8b5cf6', // violet
		'#a855f7', // purple
		'#d946ef', // fuchsia
		'#ec4899', // pink
		'#6b7280', // gray
		'#78716c' // stone
	];

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Category' : 'Edit Category');
	const isValid = $derived(name.trim().length > 0);

	// Reset form when modal opens or category changes
	$effect(() => {
		if (open) {
			name = category?.name ?? '';
			color = category?.color ?? '#6366f1';
		}
	});

	function getFormData(): ChannelCategoryFormData {
		return {
			name: name.trim(),
			color
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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-w-md">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">{modalTitle}</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Form -->
			<div class="space-y-4">
				<div class="form-control">
					<label class="label py-1" for="categoryName">
						<span class="label-text">Name</span>
					</label>
					<input
						id="categoryName"
						type="text"
						class="input-bordered input input-sm"
						bind:value={name}
						placeholder="e.g., Sports, Movies, News"
						maxlength="50"
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="categoryColor">
						<span class="label-text">Color</span>
					</label>
					<div class="flex flex-wrap gap-2">
						{#each presetColors as presetColor (presetColor)}
							<button
								type="button"
								class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 {color ===
								presetColor
									? 'border-base-content ring-2 ring-base-content ring-offset-2 ring-offset-base-100'
									: 'border-transparent'}"
								style="background-color: {presetColor};"
								onclick={() => (color = presetColor)}
								aria-label="Select color {presetColor}"
							></button>
						{/each}
					</div>
					<div class="mt-2 flex items-center gap-2">
						<input
							id="categoryColor"
							type="color"
							class="h-8 w-8 cursor-pointer rounded border-none"
							bind:value={color}
						/>
						<span class="font-mono text-sm opacity-70">{color}</span>
					</div>
				</div>

				<!-- Preview -->
				<div class="form-control">
					<label class="label py-1">
						<span class="label-text">Preview</span>
					</label>
					<div class="flex items-center gap-2">
						<span class="badge badge-sm text-white" style="background-color: {color};">
							{name || 'Category Name'}
						</span>
					</div>
				</div>
			</div>

			<!-- Error -->
			{#if error}
				<div class="mt-4 alert text-sm alert-error">
					{error}
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-action">
				{#if mode === 'edit' && onDelete}
					<button class="btn mr-auto btn-outline btn-sm btn-error" onclick={onDelete}>
						Delete
					</button>
				{/if}

				<button class="btn btn-ghost btn-sm" onclick={onClose}>Cancel</button>

				<button class="btn btn-sm btn-primary" onclick={handleSave} disabled={saving || !isValid}>
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
