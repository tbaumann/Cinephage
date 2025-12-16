<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { ScoringProfile, ScoringProfileFormData } from '$lib/types/profile';
	import { ProfileList, ProfileModal } from '$lib/components/profiles';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	let { data }: { data: PageData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit' | 'view'>('add');
	let selectedProfile = $state<ScoringProfile | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Delete confirmation
	let deleteConfirmOpen = $state(false);
	let deleteTarget = $state<ScoringProfile | null>(null);

	function openAddModal() {
		modalMode = 'add';
		selectedProfile = null;
		error = null;
		modalOpen = true;
	}

	function openEditModal(profile: ScoringProfile) {
		modalMode = 'edit';
		selectedProfile = profile;
		error = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		selectedProfile = null;
		error = null;
	}

	async function handleSave(formData: ScoringProfileFormData) {
		saving = true;
		error = null;

		try {
			const url = '/api/scoring-profiles';
			const method = modalMode === 'add' ? 'POST' : 'PUT';
			const body = modalMode === 'add' ? formData : { id: selectedProfile?.id, ...formData };

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save profile');
			}

			await invalidateAll();
			closeModal();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	function confirmDelete(profile: ScoringProfile) {
		deleteTarget = profile;
		deleteConfirmOpen = true;
	}

	async function handleDelete() {
		if (!deleteTarget) return;

		try {
			const response = await fetch('/api/scoring-profiles', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: deleteTarget.id })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to delete profile');
			}

			await invalidateAll();
		} catch (e) {
			console.error('Delete failed:', e);
		} finally {
			deleteConfirmOpen = false;
			deleteTarget = null;
		}
	}

	async function handleSetDefault(profile: ScoringProfile) {
		try {
			const response = await fetch('/api/scoring-profiles', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: profile.id,
					isDefault: true
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to set default');
			}

			await invalidateAll();
		} catch (e) {
			console.error('Set default failed:', e);
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Quality Profiles</h1>
		<p class="text-base-content/70">
			Manage quality profiles that determine how releases are scored and selected. Each profile
			assigns scores to different formats (resolution, audio, HDR, etc.) to rank releases by
			quality.
		</p>
	</div>

	<!-- Profile List -->
	<ProfileList
		profiles={data.profiles}
		onAdd={openAddModal}
		onEdit={openEditModal}
		onDelete={confirmDelete}
		onSetDefault={handleSetDefault}
	/>
</div>

<!-- Profile Modal -->
<ProfileModal
	open={modalOpen}
	mode={modalMode}
	profile={selectedProfile}
	baseProfiles={data.baseProfiles}
	defaultBaseProfileId={data.defaultProfileId}
	{saving}
	{error}
	onClose={closeModal}
	onSave={handleSave}
/>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	open={deleteConfirmOpen}
	title="Confirm Delete"
	message="Are you sure you want to delete {deleteTarget?.name}? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleDelete}
	onCancel={() => (deleteConfirmOpen = false)}
/>
