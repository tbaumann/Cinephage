<script lang="ts">
	import { X, Loader2 } from 'lucide-svelte';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmVariant?: 'error' | 'warning' | 'primary';
		loading?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		title = 'Confirm',
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmVariant = 'primary',
		loading = false,
		onConfirm,
		onCancel
	}: Props = $props();

	const buttonClass = $derived(
		confirmVariant === 'error'
			? 'btn-error'
			: confirmVariant === 'warning'
				? 'btn-warning'
				: 'btn-primary'
	);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		}
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-w-md">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-bold">{title}</h3>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					onclick={onCancel}
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<p class="py-2">{message}</p>

			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={onCancel} disabled={loading}>
					{cancelLabel}
				</button>
				<button type="button" class="btn {buttonClass}" onclick={onConfirm} disabled={loading}>
					{#if loading}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					{confirmLabel}
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onCancel}
			aria-label="Close modal"
		></button>
	</div>
{/if}
