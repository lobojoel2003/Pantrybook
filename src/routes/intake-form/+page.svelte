<script lang="ts">
	import { page } from '$app/state';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import IntakeForm from '#lib/components/IntakeForm.svelte';

	const householdId = $derived(page.url.searchParams.get('household'));
	const household = $derived(householdId ? (pantry.household(householdId) ?? null) : null);
</script>

<svelte:head>
	<title>Intake form · Pantrybook</title>
</svelte:head>

<div class="page">
	<header class="page-header no-print">
		<div>
			<h1>{household ? 'Print household form' : 'Paper intake form'}</h1>
			<p>
				{household
					? 'A filled-in copy for the family to check and sign.'
					: 'For registering families when there is no device or no power. Works offline.'}
			</p>
		</div>
		<button type="button" class="btn primary" onclick={() => window.print()}>
			<Icon name="printer" /> Print
		</button>
	</header>
	<IntakeForm settings={pantry.settings} {household} />
</div>
