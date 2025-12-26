<script lang="ts">
	import { X, Loader2, AlertTriangle } from 'lucide-svelte';

	interface Props {
		open: boolean;
		selectedCount: number;
		mediaType: 'movie' | 'series';
		loading: boolean;
		onConfirm: (deleteFiles: boolean) => void;
		onCancel: () => void;
	}

	let { open, selectedCount, mediaType, loading, onConfirm, onCancel }: Props = $props();

	let deleteFiles = $state(false);

	// Reset when modal closes
	$effect(() => {
		if (!open) {
			deleteFiles = false;
		}
	});

	const itemLabel = $derived(
		mediaType === 'movie'
			? selectedCount === 1
				? 'movie'
				: 'movies'
			: selectedCount === 1
				? 'series'
				: 'series'
	);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		}
	}

	function handleConfirm() {
		onConfirm(deleteFiles);
	}

	function handleClose() {
		deleteFiles = false;
		onCancel();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-w-md">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-bold">Delete Files</h3>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					onclick={handleClose}
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<p class="py-2">
				Delete files for <strong>{selectedCount} {itemLabel}</strong>? The items will remain in your
				library but show as missing.
			</p>

			<div class="form-control mt-4">
				<label class="label cursor-pointer justify-start gap-3">
					<input type="checkbox" class="checkbox checkbox-error" bind:checked={deleteFiles} />
					<span class="label-text">Delete files from disk</span>
				</label>
			</div>

			{#if deleteFiles}
				<div class="mt-3 alert alert-warning">
					<AlertTriangle class="h-4 w-4" />
					<span class="text-sm"
						>Files will be permanently deleted from disk. This cannot be undone.</span
					>
				</div>
			{:else}
				<div class="mt-3 alert alert-info">
					<span class="text-sm"
						>Files will remain on disk but become unmatched. You can re-match them later.</span
					>
				</div>
			{/if}

			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={loading}>
					Cancel
				</button>
				<button type="button" class="btn btn-error" onclick={handleConfirm} disabled={loading}>
					{#if loading}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Delete {selectedCount}
					{itemLabel}
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={handleClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
