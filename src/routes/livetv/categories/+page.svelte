<script lang="ts">
	import { LayoutGrid, Tv } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Group categories by account
	const categoriesByAccount = $derived(() => {
		const grouped: Record<string, { accountName: string; categories: typeof data.categories }> = {};
		for (const category of data.categories) {
			if (!grouped[category.accountId]) {
				grouped[category.accountId] = {
					accountName: category.accountName,
					categories: []
				};
			}
			grouped[category.accountId].categories.push(category);
		}
		return Object.entries(grouped);
	});
</script>

<svelte:head>
	<title>Categories - Cinephage</title>
</svelte:head>

<div class="w-full p-4">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Live TV Categories</h1>
		<p class="text-base-content/70">Browse channel categories from all your IPTV accounts.</p>
	</div>

	{#if data.categories.length === 0}
		<div class="py-12 text-center text-base-content/60">
			<LayoutGrid class="mx-auto mb-4 h-12 w-12 opacity-40" />
			<p class="text-lg font-medium">No categories available</p>
			<p class="mt-1 text-sm">Add an IPTV account and test the connection to see categories</p>
			<a href="/livetv/accounts" class="btn mt-4 btn-primary">Manage Accounts</a>
		</div>
	{:else}
		<!-- Categories grouped by account -->
		{#each categoriesByAccount() as [accountId, { accountName, categories }] (accountId)}
			<div class="mb-8">
				<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<Tv class="h-5 w-5" />
					{accountName}
					<span class="badge badge-ghost badge-sm">{categories.length} categories</span>
				</h2>

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each categories as category (category.id + accountId)}
						<a
							href="/livetv/channels?category={category.id}&account={accountId}"
							class="card bg-base-100 shadow transition-all hover:bg-base-200 hover:shadow-md"
						>
							<div class="card-body p-4">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<h3 class="truncate font-medium" title={category.title}>
											{category.title}
										</h3>
										{#if category.alias}
											<p class="truncate text-sm opacity-50" title={category.alias}>
												{category.alias}
											</p>
										{/if}
									</div>
									<span class="badge shrink-0 badge-ghost badge-sm">#{category.number}</span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
