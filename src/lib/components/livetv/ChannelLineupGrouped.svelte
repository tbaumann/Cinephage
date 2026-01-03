<script lang="ts">
	import { GripVertical, Tv, Trash2, Pencil, Plus, Folder } from 'lucide-svelte';
	import type { ChannelLineupItemWithAccount, ChannelCategory } from '$lib/types/livetv';

	interface CategoryWithCount extends ChannelCategory {
		channelCount: number;
	}

	// Row can be either a category header or a channel
	type TableRow =
		| { type: 'category'; category: CategoryWithCount }
		| { type: 'channel'; channel: ChannelLineupItemWithAccount };

	interface Props {
		items: ChannelLineupItemWithAccount[];
		categories: CategoryWithCount[];
		selectedIds: Set<string>;
		reorderMode: boolean;
		onToggleSelect: (id: string) => void;
		onSelectAll: () => void;
		onClearSelection: () => void;
		onReorder: (itemIds: string[]) => void;
		onRemove: (itemIds: string[]) => void;
		onToggleReorderMode: () => void;
		onEdit: (item: ChannelLineupItemWithAccount) => void;
		onAddCategory: () => void;
		onEditCategory: (category: ChannelCategory) => void;
		onDeleteCategory: (category: ChannelCategory) => void;
	}

	let {
		items,
		categories,
		selectedIds,
		reorderMode,
		onToggleSelect,
		onSelectAll,
		onClearSelection,
		onReorder,
		onRemove,
		onToggleReorderMode,
		onEdit,
		onAddCategory,
		onEditCategory,
		onDeleteCategory
	}: Props = $props();

	// Build flat list of rows: categories as headers, channels underneath
	const tableRows = $derived(() => {
		const rows: TableRow[] = [];

		// Group channels by categoryId (using 'null' string key for uncategorized)
		const channelsByCategory: Record<string, ChannelLineupItemWithAccount[]> = { null: [] };
		for (const cat of categories) {
			channelsByCategory[cat.id] = [];
		}
		for (const item of items) {
			const catId = item.categoryId ?? 'null';
			if (!channelsByCategory[catId]) {
				channelsByCategory[catId] = [];
			}
			channelsByCategory[catId].push(item);
		}

		// Add uncategorized channels first (no header)
		const uncategorized = channelsByCategory['null'] || [];
		for (const ch of uncategorized) {
			rows.push({ type: 'channel', channel: ch });
		}

		// Add each category and its channels
		for (const cat of categories) {
			rows.push({ type: 'category', category: cat });
			const catChannels = channelsByCategory[cat.id] || [];
			for (const ch of catChannels) {
				rows.push({ type: 'channel', channel: ch });
			}
		}

		return rows;
	});

	// Drag and drop state
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function handleDragStart(event: DragEvent, index: number) {
		if (!reorderMode) return;
		draggedIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		if (!reorderMode || draggedIndex === null) return;
		event.preventDefault();
		dragOverIndex = index;
	}

	function handleDragLeave() {
		dragOverIndex = null;
	}

	function handleDrop(event: DragEvent, dropIndex: number) {
		if (!reorderMode || draggedIndex === null) return;
		event.preventDefault();

		if (draggedIndex !== dropIndex) {
			const rows = tableRows();
			const draggedRow = rows[draggedIndex];

			// Only reorder channels
			if (draggedRow.type === 'channel') {
				const newRows = [...rows];
				const [removed] = newRows.splice(draggedIndex, 1);
				newRows.splice(dropIndex, 0, removed);

				// Extract channel IDs in new order
				const newChannelOrder = newRows
					.filter(
						(r): r is { type: 'channel'; channel: ChannelLineupItemWithAccount } =>
							r.type === 'channel'
					)
					.map((r) => r.channel.id);

				onReorder(newChannelOrder);
			}
		}

		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}

	// Get unique accounts for color badges
	const accountColors = $derived(() => {
		const colors = [
			'bg-primary text-primary-content',
			'bg-secondary text-secondary-content',
			'bg-accent text-accent-content',
			'bg-info text-info-content',
			'bg-warning text-warning-content'
		];
		const accounts = [...new Set(items.map((i) => i.accountId))];
		return new Map(accounts.map((id, idx) => [id, colors[idx % colors.length]]));
	});

	const allSelected = $derived(items.length > 0 && selectedIds.size === items.length);
	const someSelected = $derived(selectedIds.size > 0 && selectedIds.size < items.length);

	function getRowKey(row: TableRow): string {
		return row.type === 'category' ? `cat-${row.category.id}` : `ch-${row.channel.id}`;
	}
</script>

{#if items.length === 0 && categories.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Folder class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">Your lineup is empty</p>
		<p class="mt-1 text-sm">Browse channels and add them to your custom lineup</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		<!-- Header bar -->
		<div class="flex items-center justify-between border-b border-base-300 px-4 py-2">
			<div class="flex items-center gap-2">
				{#if !reorderMode}
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={allSelected}
						indeterminate={someSelected}
						onchange={() => (allSelected ? onClearSelection() : onSelectAll())}
					/>
					<span class="text-sm text-base-content/70">
						{selectedIds.size > 0 ? `${selectedIds.size} selected` : `${items.length} channels`}
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if selectedIds.size > 0 && !reorderMode}
					<button class="btn btn-sm btn-error" onclick={() => onRemove(Array.from(selectedIds))}>
						<Trash2 class="h-4 w-4" />
						Remove ({selectedIds.size})
					</button>
				{/if}
				<button class="btn btn-ghost btn-sm" onclick={onAddCategory} title="Add category">
					<Plus class="h-4 w-4" />
					Category
				</button>
				<button
					class="btn btn-sm {reorderMode ? 'btn-primary' : 'btn-ghost'}"
					onclick={onToggleReorderMode}
				>
					<GripVertical class="h-4 w-4" />
					{reorderMode ? 'Done' : 'Reorder'}
				</button>
			</div>
		</div>

		{#if reorderMode}
			<div class="flex items-center gap-2 bg-info/10 px-4 py-2 text-sm text-info">
				<GripVertical class="h-4 w-4" />
				Drag channels to reorder your lineup.
			</div>
		{/if}

		<!-- Single unified table -->
		<table class="table">
			<thead>
				<tr>
					<th class="w-10"></th>
					<th class="w-16">#</th>
					<th><span class="pl-14">Channel</span></th>
					<th>Account</th>
					<th class="w-10"></th>
				</tr>
			</thead>
			<tbody>
				{#each tableRows() as row, index (getRowKey(row))}
					{#if row.type === 'category'}
						<!-- Category header row -->
						<tr class="bg-base-200/70 hover:bg-base-200">
							<td class="py-2">
								{#if reorderMode}
									<span class="opacity-30">
										<GripVertical class="h-4 w-4" />
									</span>
								{/if}
							</td>
							<td class="py-2"></td>
							<td class="py-2">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center">
										<span
											class="h-4 w-4 rounded-full"
											style="background-color: {row.category.color || '#6b7280'};"
										></span>
									</div>
									<div>
										<span class="font-semibold">{row.category.name}</span>
										<span class="ml-2 badge badge-ghost badge-sm">{row.category.channelCount}</span>
									</div>
								</div>
							</td>
							<td class="py-2"></td>
							<td class="py-2">
								<div class="flex gap-1">
									<button
										class="btn btn-circle btn-ghost btn-xs"
										onclick={() => onEditCategory(row.category)}
										title="Edit category"
									>
										<Pencil class="h-3 w-3" />
									</button>
									<button
										class="btn btn-circle text-error btn-ghost btn-xs"
										onclick={() => onDeleteCategory(row.category)}
										title="Delete category"
									>
										<Trash2 class="h-3 w-3" />
									</button>
								</div>
							</td>
						</tr>
					{:else}
						<!-- Channel row -->
						<tr
							class="group hover transition-colors {draggedIndex === index
								? 'opacity-50'
								: ''} {dragOverIndex === index ? 'bg-primary/10' : ''}"
							draggable={reorderMode}
							ondragstart={(e) => handleDragStart(e, index)}
							ondragover={(e) => handleDragOver(e, index)}
							ondragleave={handleDragLeave}
							ondrop={(e) => handleDrop(e, index)}
							ondragend={handleDragEnd}
						>
							<td class="py-2">
								{#if reorderMode}
									<span class="cursor-grab">
										<GripVertical class="h-4 w-4 text-base-content/50" />
									</span>
								{:else}
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={selectedIds.has(row.channel.id)}
										onchange={() => onToggleSelect(row.channel.id)}
									/>
								{/if}
							</td>
							<td class="py-2">
								<div class="flex flex-col">
									<span class="font-mono text-sm opacity-70">{row.channel.position}</span>
									{#if row.channel.channelNumber}
										<span class="font-mono text-xs text-primary"
											>Ch {row.channel.channelNumber}</span
										>
									{/if}
								</div>
							</td>
							<td class="py-2">
								<div class="flex items-center gap-3">
									{#if row.channel.displayLogo}
										<div class="avatar">
											<div class="h-10 w-10 rounded bg-base-100">
												<img
													src={row.channel.displayLogo}
													alt={row.channel.displayName}
													class="object-contain"
													loading="lazy"
													onerror={(e) => {
														const target = e.target as HTMLImageElement;
														target.style.display = 'none';
													}}
												/>
											</div>
										</div>
									{:else}
										<div class="placeholder avatar">
											<div class="flex h-10 w-10 items-center justify-center rounded bg-base-300">
												<Tv class="h-5 w-5 opacity-40" />
											</div>
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<div class="truncate font-medium">
											{row.channel.displayName}
											{#if row.channel.customName}
												<span class="ml-1 text-xs text-primary">(custom)</span>
											{/if}
										</div>
										{#if row.channel.epgId}
											<div class="truncate font-mono text-xs opacity-50">
												{row.channel.epgId}
											</div>
										{/if}
									</div>
								</div>
							</td>
							<td class="py-2">
								<span class="badge badge-sm {accountColors().get(row.channel.accountId)}">
									{row.channel.accountName}
								</span>
							</td>
							<td class="py-2">
								<button
									class="btn btn-circle opacity-0 btn-ghost transition-opacity btn-sm group-hover:opacity-100"
									onclick={() => onEdit(row.channel)}
									title="Edit channel"
								>
									<Pencil class="h-4 w-4" />
								</button>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
{/if}
