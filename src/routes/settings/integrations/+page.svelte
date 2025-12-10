<script lang="ts">
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import {
		Database,
		Download,
		Subtitles,
		CheckCircle,
		AlertCircle,
		ChevronRight,
		Languages,
		Film
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface IntegrationCard {
		title: string;
		description: string;
		href: string;
		icon: typeof Database;
		stats: { label: string; value: string | number; status?: 'success' | 'warning' | 'error' }[];
	}

	// Use $derived.by for reactive computation from props
	const integrations = $derived.by<IntegrationCard[]>(() => [
		{
			title: 'Indexers',
			description: 'Configure torrent indexers for content search',
			href: '/settings/integrations/indexers',
			icon: Database,
			stats: [
				{ label: 'Total', value: data.indexers.total },
				{
					label: 'Enabled',
					value: data.indexers.enabled,
					status: data.indexers.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Download Clients',
			description: 'Configure torrent clients for downloading content',
			href: '/settings/integrations/download-clients',
			icon: Download,
			stats: [
				{ label: 'Total', value: data.downloadClients.total },
				{
					label: 'Enabled',
					value: data.downloadClients.enabled,
					status: data.downloadClients.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Subtitle Providers',
			description: 'Configure providers for automatic subtitle downloads',
			href: '/settings/integrations/subtitle-providers',
			icon: Subtitles,
			stats: [
				{ label: 'Total', value: data.subtitleProviders.total },
				{
					label: 'Enabled',
					value: data.subtitleProviders.enabled,
					status: data.subtitleProviders.enabled > 0 ? 'success' : 'warning'
				},
				{
					label: 'Healthy',
					value: `${data.subtitleProviders.healthy}/${data.subtitleProviders.total}`,
					status:
						data.subtitleProviders.healthy === data.subtitleProviders.total ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Language Profiles',
			description: 'Define subtitle language preferences for media',
			href: '/settings/integrations/language-profiles',
			icon: Languages,
			stats: [
				{ label: 'Profiles', value: data.languageProfiles.total },
				{
					label: 'Default',
					value: data.languageProfiles.hasDefault ? 'Set' : 'Not Set',
					status: data.languageProfiles.hasDefault ? 'success' : 'warning'
				}
			]
		}
	]);
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Integrations</h1>
		<p class="text-base-content/70">Manage external service connections and data sources.</p>
	</div>

	<!-- TMDB API Status -->
	<div class="mb-6">
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<div class="flex items-center gap-4">
					<div class="rounded-lg bg-base-200 p-3">
						<Film class="h-6 w-6 text-primary" />
					</div>
					<div class="flex-1">
						<h2 class="text-lg font-semibold">TMDB Integration</h2>
						<p class="text-sm text-base-content/70">The Movie Database API for metadata</p>
					</div>
					<div class="flex items-center gap-2">
						{#if data.tmdb.hasApiKey}
							<div class="badge gap-1 badge-success">
								<CheckCircle class="h-3 w-3" />
								Configured
							</div>
						{:else}
							<div class="badge gap-1 badge-warning">
								<AlertCircle class="h-3 w-3" />
								Not Configured
							</div>
						{/if}
						<a href={resolve('/settings/general')} class="btn btn-ghost btn-sm">
							Configure
							<ChevronRight class="h-4 w-4" />
						</a>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Integration Cards Grid -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each integrations as integration (integration.href)}
			{@const Icon = integration.icon}
			<a
				href={resolvePath(integration.href)}
				class="card bg-base-100 shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
			>
				<div class="card-body">
					<div class="flex items-start gap-3">
						<div class="rounded-lg bg-base-200 p-3">
							<Icon class="h-6 w-6 text-primary" />
						</div>
						<div class="flex-1">
							<h2 class="card-title text-lg">{integration.title}</h2>
							<p class="text-sm text-base-content/70">{integration.description}</p>
						</div>
						<ChevronRight class="h-5 w-5 text-base-content/50" />
					</div>

					<div class="divider my-2"></div>

					<div class="flex flex-wrap gap-3">
						{#each integration.stats as stat (stat.label)}
							<div class="flex items-center gap-2">
								<span class="text-sm text-base-content/70">{stat.label}:</span>
								<span
									class="font-medium {stat.status === 'success'
										? 'text-success'
										: stat.status === 'warning'
											? 'text-warning'
											: stat.status === 'error'
												? 'text-error'
												: ''}"
								>
									{stat.value}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</a>
		{/each}
	</div>

	<!-- Quick Start Guide -->
	{#if data.indexers.total === 0 || data.downloadClients.total === 0}
		<div class="mt-6">
			<div class="alert alert-info">
				<AlertCircle class="h-5 w-5" />
				<div>
					<h3 class="font-semibold">Getting Started</h3>
					<p class="text-sm">
						{#if data.indexers.total === 0 && data.downloadClients.total === 0}
							Configure at least one indexer and one download client to start acquiring content.
						{:else if data.indexers.total === 0}
							Add an indexer to search for content.
						{:else}
							Add a download client to download content.
						{/if}
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>
