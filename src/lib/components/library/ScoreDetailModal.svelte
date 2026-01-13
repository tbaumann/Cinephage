<script lang="ts">
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import ModalHeader from '$lib/components/ui/modal/ModalHeader.svelte';
	import {
		TrendingUp,
		TrendingDown,
		Check,
		X,
		AlertCircle,
		ChevronDown,
		ChevronRight
	} from 'lucide-svelte';
	import type { FileScoreResponse } from '$lib/types/score';

	interface Props {
		open: boolean;
		onClose: () => void;
		scoreData: FileScoreResponse | null;
	}

	let { open, onClose, scoreData }: Props = $props();

	let showAttributes = $state(false);
	let showFormats = $state(false);

	const breakdownCategories = [
		{ key: 'resolution', label: 'Resolution' },
		{ key: 'source', label: 'Source' },
		{ key: 'codec', label: 'Codec' },
		{ key: 'audio', label: 'Audio' },
		{ key: 'hdr', label: 'HDR' },
		{ key: 'streaming', label: 'Streaming' },
		{ key: 'releaseGroupTier', label: 'Release Group' },
		{ key: 'enhancement', label: 'Enhancement' },
		{ key: 'banned', label: 'Banned' }
	] as const;

	function formatScore(score: number): string {
		if (score === 0) return '0';
		const prefix = score > 0 ? '+' : '';
		return prefix + score.toLocaleString();
	}

	function getScoreColor(score: number): string {
		if (score > 0) return 'text-success';
		if (score < 0) return 'text-error';
		return 'text-base-content/50';
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="2xl">
	<ModalHeader title="Score Details" {onClose} />

	{#if scoreData}
		<div class="space-y-6">
			<!-- Score Summary -->
			<div class="rounded-lg bg-base-200 p-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-6">
						<div>
							<div class="text-3xl font-bold">
								{scoreData.normalizedScore}
							</div>
							<div class="text-sm text-base-content/70">Normalized Score</div>
							<div class="text-xs text-base-content/50">Compare with search results</div>
						</div>
						<div class="border-l border-base-300 pl-6">
							<div class="text-xl font-medium text-base-content/70">
								{scoreData.scoringResult.totalScore.toLocaleString()}
							</div>
							<div class="text-xs text-base-content/50">Raw Score</div>
						</div>
					</div>
					<div class="text-right">
						<div class="text-sm font-medium">{scoreData.profileInfo.name}</div>
						<div class="text-xs text-base-content/50">Scoring Profile</div>
					</div>
				</div>
			</div>

			<!-- Upgrade Status -->
			<div class="rounded-lg border border-base-300 p-4">
				<h4 class="mb-3 font-semibold">Upgrade Status</h4>
				<div class="grid gap-3 sm:grid-cols-2">
					<!-- Upgrades Allowed -->
					<div class="flex items-center gap-2">
						{#if scoreData.upgradeStatus.upgradesAllowed}
							<Check size={16} class="text-success" />
							<span class="text-sm">Upgrades enabled</span>
						{:else}
							<X size={16} class="text-error" />
							<span class="text-sm">Upgrades disabled</span>
						{/if}
					</div>

					<!-- Cutoff Status -->
					<div class="flex items-center gap-2">
						{#if scoreData.upgradeStatus.upgradeUntilScore <= 0}
							<AlertCircle size={16} class="text-info" />
							<span class="text-sm">No cutoff set (unlimited upgrades)</span>
						{:else if scoreData.upgradeStatus.isAtCutoff}
							<TrendingUp size={16} class="text-success" />
							<span class="text-sm">
								At cutoff ({scoreData.upgradeStatus.currentScore.toLocaleString()} &gt;= {scoreData.upgradeStatus.upgradeUntilScore.toLocaleString()})
							</span>
						{:else}
							<TrendingDown size={16} class="text-warning" />
							<span class="text-sm">
								Below cutoff ({scoreData.upgradeStatus.currentScore.toLocaleString()} &lt; {scoreData.upgradeStatus.upgradeUntilScore.toLocaleString()})
							</span>
						{/if}
					</div>

					<!-- Minimum Score -->
					<div class="flex items-center gap-2">
						{#if scoreData.scoringResult.meetsMinimum}
							<Check size={16} class="text-success" />
							<span class="text-sm">Meets minimum score ({scoreData.profileInfo.minScore})</span>
						{:else}
							<X size={16} class="text-error" />
							<span class="text-sm">Below minimum ({scoreData.profileInfo.minScore})</span>
						{/if}
					</div>

					<!-- Min Score Increment -->
					<div class="flex items-center gap-2">
						<AlertCircle size={16} class="text-info" />
						<span class="text-sm">
							Min upgrade improvement: {scoreData.upgradeStatus.minScoreIncrement.toLocaleString()}
						</span>
					</div>
				</div>
			</div>

			<!-- Score Breakdown -->
			<div class="rounded-lg border border-base-300 p-4">
				<h4 class="mb-3 font-semibold">Score Breakdown</h4>
				<div class="overflow-x-auto">
					<table class="table-compact table w-full">
						<thead>
							<tr>
								<th>Category</th>
								<th class="text-right">Score</th>
								<th>Matched Formats</th>
							</tr>
						</thead>
						<tbody>
							{#each breakdownCategories as { key, label }}
								{@const category = scoreData.scoringResult.breakdown[key]}
								{#if category.formats.length > 0 || category.score !== 0}
									<tr>
										<td class="font-medium">{label}</td>
										<td class="text-right {getScoreColor(category.score)}">
											{formatScore(category.score)}
										</td>
										<td class="text-sm text-base-content/70">
											{category.formats.join(', ') || '-'}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
						<tfoot>
							<tr class="font-bold">
								<td>Total</td>
								<td class="text-right">{scoreData.scoringResult.totalScore.toLocaleString()}</td>
								<td></td>
							</tr>
						</tfoot>
					</table>
				</div>
			</div>

			<!-- Matched Formats (Collapsible) -->
			<div class="rounded-lg border border-base-300">
				<button
					type="button"
					class="flex w-full items-center justify-between p-4 text-left hover:bg-base-200"
					onclick={() => (showFormats = !showFormats)}
				>
					<h4 class="font-semibold">
						Matched Formats ({scoreData.scoringResult.matchedFormats.length})
					</h4>
					{#if showFormats}
						<ChevronDown size={16} />
					{:else}
						<ChevronRight size={16} />
					{/if}
				</button>
				{#if showFormats}
					<div class="border-t border-base-300 p-4">
						<div class="flex flex-wrap gap-2">
							{#each scoreData.scoringResult.matchedFormats as format}
								<div
									class="badge {format.score >= 0 ? 'badge-outline' : 'badge-error badge-outline'}"
									title="{format.format.category}: {format.score}"
								>
									{format.format.name}
									<span class="ml-1 opacity-70">({formatScore(format.score)})</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Detected Attributes (Collapsible) -->
			<div class="rounded-lg border border-base-300">
				<button
					type="button"
					class="flex w-full items-center justify-between p-4 text-left hover:bg-base-200"
					onclick={() => (showAttributes = !showAttributes)}
				>
					<h4 class="font-semibold">
						Detected Attributes
						<span class="ml-2 text-xs font-normal text-base-content/50">
							(Source: {scoreData.dataSource})
						</span>
					</h4>
					{#if showAttributes}
						<ChevronDown size={16} />
					{:else}
						<ChevronRight size={16} />
					{/if}
				</button>
				{#if showAttributes}
					<div class="border-t border-base-300 p-4">
						<div class="grid gap-2 text-sm sm:grid-cols-2">
							<div>
								<span class="text-base-content/50">Resolution:</span>
								<span class="ml-2">{scoreData.attributes.resolution || 'unknown'}</span>
							</div>
							<div>
								<span class="text-base-content/50">Source:</span>
								<span class="ml-2">{scoreData.attributes.source || 'unknown'}</span>
							</div>
							<div>
								<span class="text-base-content/50">Codec:</span>
								<span class="ml-2">{scoreData.attributes.codec || 'unknown'}</span>
							</div>
							<div>
								<span class="text-base-content/50">Audio:</span>
								<span class="ml-2">{scoreData.attributes.audio || 'unknown'}</span>
							</div>
							<div>
								<span class="text-base-content/50">HDR:</span>
								<span class="ml-2">{scoreData.attributes.hdr || 'none'}</span>
							</div>
							<div>
								<span class="text-base-content/50">Release Group:</span>
								<span class="ml-2">{scoreData.attributes.releaseGroup || 'unknown'}</span>
							</div>
							{#if scoreData.attributes.streamingService}
								<div>
									<span class="text-base-content/50">Streaming Service:</span>
									<span class="ml-2">{scoreData.attributes.streamingService}</span>
								</div>
							{/if}
							{#if scoreData.attributes.edition}
								<div>
									<span class="text-base-content/50">Edition:</span>
									<span class="ml-2">{scoreData.attributes.edition}</span>
								</div>
							{/if}
							<div>
								<span class="text-base-content/50">Remux:</span>
								<span class="ml-2">{scoreData.attributes.isRemux ? 'Yes' : 'No'}</span>
							</div>
							<div>
								<span class="text-base-content/50">Repack/Proper:</span>
								<span class="ml-2">
									{scoreData.attributes.isRepack
										? 'Repack'
										: scoreData.attributes.isProper
											? 'Proper'
											: 'No'}
								</span>
							</div>
						</div>
						{#if scoreData.sceneName}
							<div class="mt-3 border-t border-base-300 pt-3">
								<div class="text-xs text-base-content/50">Scene Name:</div>
								<div class="mt-1 break-all font-mono text-xs">{scoreData.sceneName}</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Rejection Status -->
			{#if scoreData.scoringResult.isBanned || scoreData.scoringResult.sizeRejected || scoreData.scoringResult.protocolRejected}
				<div class="rounded-lg border border-error bg-error/10 p-4">
					<h4 class="mb-2 font-semibold text-error">Rejection Status</h4>
					{#if scoreData.scoringResult.isBanned}
						<div class="text-sm">
							<span class="font-medium">Banned:</span>
							{scoreData.scoringResult.bannedReasons.join(', ')}
						</div>
					{/if}
					{#if scoreData.scoringResult.sizeRejected}
						<div class="text-sm">
							<span class="font-medium">Size Rejected:</span>
							{scoreData.scoringResult.sizeRejectionReason}
						</div>
					{/if}
					{#if scoreData.scoringResult.protocolRejected}
						<div class="text-sm">
							<span class="font-medium">Protocol Rejected:</span>
							{scoreData.scoringResult.protocolRejectionReason}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="py-8 text-center text-base-content/50">No score data available</div>
	{/if}
</ModalWrapper>
