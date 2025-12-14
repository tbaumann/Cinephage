<script lang="ts">
	import { AlertCircle, Settings } from 'lucide-svelte';

	let { message = 'TMDB API key is required to use this feature.' }: { message?: string } =
		$props();
</script>

<div class="alert alert-warning shadow-lg" role="alert">
	<AlertCircle class="h-6 w-6 shrink-0" />
	<div>
		<h3 class="font-bold">TMDB Configuration Required</h3>
		<p class="text-sm">{message}</p>
	</div>
	<a href="/settings/integrations" class="btn btn-sm btn-primary gap-2">
		<Settings class="h-4 w-4" />
		Configure TMDB
	</a>
</div>
