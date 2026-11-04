<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import HouseholdForm from '#lib/components/HouseholdForm.svelte';
	import { today } from '#lib/shared/dates.ts';
	import { fullName } from '#lib/shared/household.ts';
	import type { HouseholdInput } from '#lib/shared/types.ts';

	const id = $derived(page.params.id ?? '');
	const household = $derived(pantry.household(id));
	let saving = $state(false);

	async function save(input: HouseholdInput) {
		saving = true;
		try {
			// Editing details with the family counts as confirming them.
			await pantry.saveHousehold({ ...input, verified_at: today() }, id);
			toast.success('Household updated.');
			await goto(resolve('/households/[id]', { id }), { replaceState: true });
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Edit household · Pantrybook</title>
</svelte:head>

<div class="page narrow">
	{#if !household || household.deleted}
		<div class="card empty">
			<p>This household isn't on this device.</p>
			<a class="btn" href={resolve('/households')}>Back to households</a>
		</div>
	{:else}
		<header class="page-header">
			<div>
				<h1>Edit {fullName(household)}</h1>
				<p>Saving also marks the details as confirmed today.</p>
			</div>
		</header>
		{#key household.id}
			<HouseholdForm
				initial={household}
				householdId={household.id}
				{saving}
				onsave={save}
				oncancel={() => history.back()}
			/>
		{/key}
	{/if}
</div>

<style>
	.narrow {
		max-width: 860px;
	}
</style>
