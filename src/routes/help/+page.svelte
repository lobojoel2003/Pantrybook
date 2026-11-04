<script lang="ts">
	import { resolve } from '$app/paths';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
</script>

<svelte:head>
	<title>Help · Pantrybook</title>
</svelte:head>

<div class="page guide">
	<header class="page-header">
		<div>
			<h1>Volunteer guide</h1>
			<p>Everything you need for a distribution day, in about five minutes.</p>
		</div>
		{#if pantry.session !== 'signed-in'}
			<a class="btn" href={resolve('/login')}>Sign in</a>
		{/if}
	</header>

	<section class="card">
		<h2><span class="step">1</span> Check someone in</h2>
		<ol>
			<li>
				On <strong>Check in</strong>, type part of their name, their phone number, or their
				household number.
			</li>
			<li>
				Tap their name. You'll see how many people are in the household and any notes, like
				allergies.
			</li>
			<li>
				Each program shows whether they can visit today. Enter the amount (for example, pounds of
				food) and tap <strong>Check in</strong>.
			</li>
			<li>Made a mistake? Tap <strong>Undo</strong> in the message at the bottom of the screen.</li>
		</ol>
	</section>

	<section class="card">
		<h2><span class="step">2</span> Register a new household</h2>
		<ol>
			<li>
				Tap <strong>New household</strong>. Only a name and the number of people are required.
			</li>
			<li>
				If Pantrybook thinks the family might already be registered, it shows a yellow box. Check it
				before saving, to avoid duplicates.
			</li>
			<li>Tap <strong>Save and check in</strong> to register and serve them in one step.</li>
		</ol>
		<p class="muted">
			No device handy? <a href={resolve('/intake-form')}>Print a paper intake form</a> and type it in
			later.
		</p>
	</section>

	<section class="card">
		<h2><span class="step">3</span> When a household has reached its limit</h2>
		<p>
			If a household has already used its visits (for example, 4 visits this month), the program
			turns red and shows the date they can come back. Depending on your pantry's rules you can
			still serve them by tapping <strong>Check in anyway</strong> and giving a short reason.
			Coordinators see these visits on the
			<strong>Visits over the limit</strong> report.
		</p>
	</section>

	<section class="card">
		<h2><span class="step">4</span> No internet? Keep going.</h2>
		<p>
			Pantrybook keeps a copy of your households on the device. If the Wi-Fi drops, a grey
			<strong>Offline</strong> bar appears — keep searching, registering and checking people in as usual.
			Everything uploads by itself when the connection is back. The status button in the corner shows
			how many changes are waiting.
		</p>
		<p class="muted">
			Don't sign out while changes are waiting, and don't clear the browser's data on this device.
		</p>
	</section>

	<section class="card">
		<h2><span class="step">5</span> Put Pantrybook on a tablet or phone</h2>
		<ul>
			<li>
				<strong>Android / Chrome / Edge:</strong> open the browser menu and choose
				<em>Install app</em>
				or <em>Add to Home screen</em>.
			</li>
			<li>
				<strong>iPhone / iPad (Safari):</strong> tap the Share button, then
				<em>Add to Home Screen</em>.
			</li>
		</ul>
		<p class="muted">
			Offline mode needs Pantrybook to be served over HTTPS (or from this computer).
		</p>
	</section>

	<section class="card">
		<h2><Icon name="shield" /> For coordinators</h2>
		<ul>
			<li>
				<strong>Programs and limits:</strong> Admin → Programs. For example, "Food Pantry, 4 visits per
				month" or "Clothing, 1 visit every 30 days".
			</li>
			<li>
				<strong>Volunteer accounts:</strong> Admin → People. Give each volunteer their own login so you
				can see who did what.
			</li>
			<li>
				<strong>Moving from a spreadsheet:</strong> Admin → Data → Import households. Pantrybook reads
				CSV files saved from Excel or Google Sheets.
			</li>
			<li>
				<strong>Reports for funders:</strong> Reports → pick the dates → download the summary CSV or print.
			</li>
			<li>
				<strong>Backups:</strong> Admin → Data → Download backup. Keep a copy somewhere safe every month.
			</li>
		</ul>
	</section>
</div>

<style>
	.guide {
		max-width: 860px;
	}

	.guide h2 {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.step {
		display: inline-grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--primary);
		color: var(--primary-text);
		font-size: 0.95rem;
		flex: none;
	}

	ol,
	ul {
		margin: 0;
		padding-left: 1.3rem;
		display: grid;
		gap: var(--space-2);
	}

	section p + p,
	section ol + p {
		margin-top: var(--space-3);
	}
</style>
