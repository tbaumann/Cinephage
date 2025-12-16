<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import type {
		DownloadClient,
		DownloadClientFormData,
		ConnectionTestResult
	} from '$lib/types/downloadClient';

	import { DownloadClientModal, DownloadClientTable } from '$lib/components/downloadClients';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Download Client state
	let clientModalOpen = $state(false);
	let clientModalMode = $state<'add' | 'edit'>('add');
	let editingClient = $state<DownloadClient | null>(null);
	let clientSaving = $state(false);
	let confirmClientDeleteOpen = $state(false);
	let deleteClientTarget = $state<DownloadClient | null>(null);

	// Client save error state
	let clientSaveError = $state<string | null>(null);

	// Download Client Functions
	function openAddClientModal() {
		clientModalMode = 'add';
		editingClient = null;
		clientSaveError = null;
		clientModalOpen = true;
	}

	function openEditClientModal(client: DownloadClient) {
		clientModalMode = 'edit';
		editingClient = client;
		clientSaveError = null;
		clientModalOpen = true;
	}

	function closeClientModal() {
		clientModalOpen = false;
		editingClient = null;
		clientSaveError = null;
	}

	async function handleClientTest(formData: DownloadClientFormData): Promise<ConnectionTestResult> {
		try {
			const response = await fetch('/api/download-clients/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					implementation: formData.implementation,
					host: formData.host,
					port: formData.port,
					useSsl: formData.useSsl,
					username: formData.username || null,
					password: formData.password || null
				})
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleClientSave(formData: DownloadClientFormData) {
		clientSaving = true;
		clientSaveError = null;
		try {
			const form = new FormData();
			form.append('data', JSON.stringify(formData));

			let response: Response;
			if (clientModalMode === 'edit' && editingClient) {
				form.append('id', editingClient.id);
				response = await fetch(`?/updateDownloadClient`, {
					method: 'POST',
					body: form
				});
			} else {
				response = await fetch(`?/createDownloadClient`, {
					method: 'POST',
					body: form
				});
			}

			// Parse the response to check for errors
			const result = await response.json();

			// SvelteKit form actions return data in a specific format
			if (result.type === 'failure' || result.data?.downloadClientError) {
				const errorMessage = result.data?.downloadClientError || 'Failed to save download client';
				clientSaveError = errorMessage;
				return;
			}

			await invalidateAll();
			closeClientModal();
		} catch (error) {
			clientSaveError = error instanceof Error ? error.message : 'An unexpected error occurred';
		} finally {
			clientSaving = false;
		}
	}

	async function handleClientDelete() {
		if (!editingClient) return;
		const form = new FormData();
		form.append('id', editingClient.id);
		await fetch(`?/deleteDownloadClient`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		closeClientModal();
	}

	function confirmClientDelete(client: DownloadClient) {
		deleteClientTarget = client;
		confirmClientDeleteOpen = true;
	}

	async function handleConfirmClientDelete() {
		if (!deleteClientTarget) return;
		const form = new FormData();
		form.append('id', deleteClientTarget.id);
		await fetch(`?/deleteDownloadClient`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmClientDeleteOpen = false;
		deleteClientTarget = null;
	}

	async function handleClientToggle(client: DownloadClient) {
		const form = new FormData();
		form.append('id', client.id);
		form.append('enabled', (!client.enabled).toString());
		await fetch(`?/toggleDownloadClient`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Download Clients</h1>
		<p class="text-base-content/70">Configure torrent clients for downloading content.</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddClientModal}>
			<Plus class="h-4 w-4" />
			Add Client
		</button>
	</div>

	{#if form?.downloadClientError}
		<div class="mb-4 alert alert-error">
			<span>{form.downloadClientError}</span>
		</div>
	{/if}

	{#if form?.downloadClientSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-0">
			<DownloadClientTable
				clients={data.downloadClients}
				onEdit={openEditClientModal}
				onDelete={confirmClientDelete}
				onToggle={handleClientToggle}
			/>
		</div>
	</div>
</div>

<!-- Download Client Modal -->
<DownloadClientModal
	open={clientModalOpen}
	mode={clientModalMode}
	client={editingClient}
	saving={clientSaving}
	error={clientSaveError}
	onClose={closeClientModal}
	onSave={handleClientSave}
	onDelete={handleClientDelete}
	onTest={handleClientTest}
/>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	open={confirmClientDeleteOpen}
	title="Confirm Delete"
	message="Are you sure you want to delete {deleteClientTarget?.name}? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmClientDelete}
	onCancel={() => (confirmClientDeleteOpen = false)}
/>
