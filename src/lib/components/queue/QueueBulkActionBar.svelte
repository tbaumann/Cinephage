<script lang="ts">
	import { X, Trash2, Loader2 } from 'lucide-svelte';

	interface Props {
		selectedCount: number;
		loading: boolean;
		onRemove: () => void;
		onClear: () => void;
	}

	let { selectedCount, loading, onRemove, onClear }: Props = $props();
</script>

{#if selectedCount > 0}
	<div
		class="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 mx-auto max-w-fit"
	>
		<div
			class="flex items-center gap-2 rounded-full border border-base-content/10 bg-base-300 px-3 py-2 shadow-xl sm:gap-3 sm:px-4 sm:py-2.5"
		>
			<span class="text-sm font-medium">
				{selectedCount} selected
			</span>

			<div class="h-4 w-px bg-base-content/20"></div>

			<button
				class="btn gap-1.5 text-error btn-ghost btn-sm hover:bg-error/10"
				onclick={onRemove}
				disabled={loading}
				title="Remove from queue"
			>
				{#if loading}
					<Loader2 size={16} class="animate-spin" />
				{:else}
					<Trash2 size={16} />
				{/if}
				<span class="hidden sm:inline">Remove</span>
			</button>

			<div class="h-4 w-px bg-base-content/20"></div>

			<button
				class="btn btn-circle btn-ghost btn-sm"
				onclick={onClear}
				disabled={loading}
				title="Clear selection"
			>
				<X size={16} />
			</button>
		</div>
	</div>
{/if}
