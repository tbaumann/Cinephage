<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { CheckCircle, Play, RefreshCw, XCircle, Clock, AlertTriangle } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let runningTasks = $state<Set<string>>(new Set());
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let lastResult = $state<Record<string, unknown> | null>(null);

	/**
	 * Format time ago for display
	 */
	function formatTimeAgo(date: string | null): string {
		if (!date) return 'Never';
		const d = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	/**
	 * Calculate task duration
	 */
	function formatDuration(startedAt: string, completedAt: string | null): string {
		if (!completedAt) return '-';
		const start = new Date(startedAt).getTime();
		const end = new Date(completedAt).getTime();
		const durationMs = end - start;
		const seconds = Math.floor(durationMs / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	/**
	 * Run a task by ID
	 */
	async function runTask(taskId: string) {
		runningTasks.add(taskId);
		runningTasks = runningTasks; // Trigger reactivity
		errorMessage = null;
		successMessage = null;
		lastResult = null;

		try {
			const response = await fetch(`/api/tasks/${taskId}/run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const result = await response.json();

			if (result.success) {
				successMessage = 'Task completed successfully';
				lastResult = result;
			} else {
				throw new Error(result.error || 'Task failed');
			}

			await invalidate('app:tasks');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Task failed';
		} finally {
			runningTasks.delete(taskId);
			runningTasks = runningTasks;
		}
	}

	/**
	 * Get CSS class for status badge
	 */
	function getStatusClass(status: string): string {
		switch (status) {
			case 'completed':
				return 'badge-success';
			case 'failed':
				return 'badge-error';
			case 'running':
				return 'badge-warning';
			default:
				return 'badge-ghost';
		}
	}

	/**
	 * Get task name from ID
	 */
	function getTaskName(taskId: string): string {
		const task = data.tasks.find((t) => t.id === taskId);
		return task?.name || taskId;
	}
</script>

<div class="w-full space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold">Tasks</h1>
		<p class="mt-1 text-base-content/60">
			Manual maintenance tasks for your Cinephage installation
		</p>
	</div>

	<!-- Alerts -->
	{#if errorMessage}
		<div class="alert alert-error">
			<XCircle class="h-5 w-5" />
			<span>{errorMessage}</span>
			<button class="btn btn-ghost btn-sm" onclick={() => (errorMessage = null)}>Dismiss</button>
		</div>
	{/if}

	{#if successMessage}
		<div class="alert alert-success">
			<CheckCircle class="h-5 w-5" />
			<div class="flex-1">
				<span>{successMessage}</span>
				{#if lastResult?.updatedFiles !== undefined}
					<span class="ml-2 text-sm opacity-80">
						Updated {lastResult.updatedFiles} of {lastResult.totalFiles} files
					</span>
				{/if}
			</div>
			<button class="btn btn-ghost btn-sm" onclick={() => (successMessage = null)}>Dismiss</button>
		</div>
	{/if}

	<!-- Task Cards -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		{#each data.tasks as task (task.id)}
			{@const status = data.taskStatuses.find((s) => s.taskId === task.id)}
			{@const isRunning = runningTasks.has(task.id) || status?.isRunning}

			<div class="card bg-base-200">
				<div class="card-body">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<h3 class="card-title text-lg">{task.name}</h3>
							<p class="mt-1 text-sm text-base-content/60">{task.description}</p>
						</div>
						<div class="rounded-lg bg-base-100 p-2">
							<RefreshCw
								class="h-5 w-5 {isRunning ? 'animate-spin text-primary' : 'text-base-content/40'}"
							/>
						</div>
					</div>

					<!-- Last Run Info -->
					<div class="mt-4 space-y-2 text-sm">
						<div class="flex items-center justify-between">
							<span class="flex items-center gap-1.5 text-base-content/60">
								<Clock class="h-4 w-4" />
								Last Run:
							</span>
							<span class="font-medium">
								{status?.lastRun ? formatTimeAgo(status.lastRun.completedAt) : 'Never'}
							</span>
						</div>
						{#if status?.lastRun}
							<div class="flex items-center justify-between">
								<span class="text-base-content/60">Status:</span>
								<span class="badge badge-sm {getStatusClass(status.lastRun.status)}">
									{status.lastRun.status}
								</span>
							</div>
							{#if status.lastRun.status === 'completed' && status.lastRun.results}
								{@const results = status.lastRun.results}
								{#if typeof results.updatedFiles === 'number'}
									<div class="flex items-center justify-between">
										<span class="text-base-content/60">Files Updated:</span>
										<span class="font-medium">
											{results.updatedFiles} / {results.totalFiles}
										</span>
									</div>
								{/if}
							{/if}
						{/if}
					</div>

					<!-- Run Button -->
					<div class="mt-4 card-actions justify-end">
						<button
							class="btn btn-sm btn-primary"
							onclick={() => runTask(task.id)}
							disabled={isRunning}
						>
							{#if isRunning}
								<span class="loading loading-sm loading-spinner"></span>
								Running...
							{:else}
								<Play class="h-4 w-4" />
								Run Now
							{/if}
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Empty State -->
	{#if data.tasks.length === 0}
		<div class="card bg-base-200">
			<div class="card-body items-center text-center">
				<AlertTriangle class="h-12 w-12 text-warning" />
				<h3 class="card-title">No Tasks Available</h3>
				<p class="text-base-content/60">No maintenance tasks are currently configured.</p>
			</div>
		</div>
	{/if}

	<!-- Recent History -->
	{#if data.recentHistory.length > 0}
		<div class="card bg-base-200">
			<div class="card-body">
				<h2 class="card-title text-lg">Recent History</h2>
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr>
								<th>Task</th>
								<th>Status</th>
								<th>Started</th>
								<th>Duration</th>
							</tr>
						</thead>
						<tbody>
							{#each data.recentHistory as entry (entry.id)}
								<tr>
									<td class="font-medium">{getTaskName(entry.taskId)}</td>
									<td>
										<span class="badge badge-sm {getStatusClass(entry.status)}">
											{entry.status}
										</span>
									</td>
									<td class="text-base-content/60">{formatTimeAgo(entry.startedAt)}</td>
									<td class="text-base-content/60">
										{formatDuration(entry.startedAt, entry.completedAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>
