<script lang="ts">
	import { enhance } from '$app/forms';
	import { X, Loader2 } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface Props {
		open: boolean;
		selectedCount: number;
		selectedIds: string[];
		loading: boolean;
		onCancel: () => void;
		onSubmitting?: () => void;
		onDone: (opts: { success: boolean; removedCount?: number; error?: string }) => void;
	}

	let { open, selectedCount, selectedIds, loading, onCancel, onSubmitting, onDone }: Props =
		$props();

	let deleteFiles = $state(false);

	$effect(() => {
		if (!open) {
			deleteFiles = false;
		}
	});

	function handleEnhance() {
		onSubmitting?.();
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: { removedCount?: number; error?: string } };
			update: () => Promise<void>;
		}) => {
			await update();
			onDone({
				success: result.type === 'success',
				removedCount: result.data?.removedCount,
				error: result.data?.error
			});
		};
	}

	function handleClose() {
		deleteFiles = false;
		onCancel();
	}
</script>

<ModalWrapper {open} onClose={handleClose} maxWidth="md" labelledBy="queue-bulk-remove-title">
	<form method="POST" action="?/removeBatch" use:enhance={handleEnhance}>
		{#each selectedIds as id (id)}
			<input type="hidden" name="ids" value={id} />
		{/each}
		<input type="hidden" name="deleteFiles" value={deleteFiles ? 'true' : 'false'} />

		<div class="mb-4 flex items-center justify-between">
			<h3 id="queue-bulk-remove-title" class="text-lg font-bold">Remove from queue</h3>
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
			Remove <strong>{selectedCount}</strong>
			{selectedCount === 1 ? 'item' : 'items'} from the queue? They will be removed from the download
			client.
		</p>

		<label class="mt-4 flex cursor-pointer items-center gap-3 py-2">
			<input type="checkbox" class="checkbox shrink-0 checkbox-error" bind:checked={deleteFiles} />
			<span class="text-sm">Delete files from download client</span>
		</label>

		<div class="modal-action">
			<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={loading}>
				Cancel
			</button>
			<button type="submit" class="btn btn-error" disabled={loading}>
				{#if loading}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Remove {selectedCount}
				{selectedCount === 1 ? 'item' : 'items'}
			</button>
		</div>
	</form>
</ModalWrapper>
