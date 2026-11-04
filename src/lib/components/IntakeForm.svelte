<script lang="ts">
	import { formatLongDate, today } from '#lib/shared/dates.ts';
	import { householdSize } from '#lib/shared/household.ts';
	import type { Household, Settings } from '#lib/shared/types.ts';

	interface Props {
		settings: Settings;
		household?: Household | null;
	}

	let { settings, household = null }: Props = $props();

	const value = (text: string | number | undefined | null) =>
		household && text !== undefined && text !== null ? String(text) : '';
</script>

<article class="intake">
	<header>
		<div>
			<h1>{settings.org_name}</h1>
			{#if settings.org_address || settings.org_phone}
				<p>{[settings.org_address, settings.org_phone].filter(Boolean).join(' · ')}</p>
			{/if}
		</div>
		<div class="title">
			<h2>Household intake form</h2>
			<p>
				Household #: <span class="box short">{household?.number ?? ''}</span>
			</p>
			<p>Date: <span class="box short">{household ? formatLongDate(today()) : ''}</span></p>
		</div>
	</header>

	<section>
		<h3>Head of household</h3>
		<div class="grid">
			<div class="line"><small>First name</small><span>{value(household?.first_name)}</span></div>
			<div class="line"><small>Last name</small><span>{value(household?.last_name)}</span></div>
			<div class="line"><small>Phone</small><span>{value(household?.phone)}</span></div>
			<div class="line"><small>Email</small><span>{value(household?.email)}</span></div>
			<div class="line wide">
				<small>Street address</small><span>{value(household?.address)}</span>
			</div>
			<div class="line"><small>City</small><span>{value(household?.city)}</span></div>
			<div class="line split">
				<div><small>State</small><span>{value(household?.state)}</span></div>
				<div><small>ZIP</small><span>{value(household?.zip)}</span></div>
			</div>
		</div>
	</section>

	<section>
		<h3>People in the household</h3>
		<table>
			<thead>
				<tr>
					<th>Children (0–17)</th>
					<th>Adults (18–64)</th>
					<th>Seniors (65+)</th>
					<th>Total</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>{value(household?.children)}</td>
					<td>{value(household?.adults)}</td>
					<td>{value(household?.seniors)}</td>
					<td>{household ? householdSize(household) : ''}</td>
				</tr>
			</tbody>
		</table>
	</section>

	<section>
		<h3>Other information</h3>
		<div class="grid">
			<div class="line">
				<small>Preferred language</small><span>{value(household?.language)}</span>
			</div>
			<div class="line">
				<small>Dietary needs / allergies</small><span>{value(household?.dietary)}</span>
			</div>
		</div>
		<p class="check">
			<span class="tick">{household?.income_eligible ? '✓' : ''}</span>
			My household's income is at or below the program guidelines (self-declared).
		</p>
	</section>

	<section class="statement">
		<p>{settings.intake_statement}</p>
		<div class="grid signatures">
			<div class="line"><small>Signature</small><span></span></div>
			<div class="line"><small>Date</small><span></span></div>
		</div>
	</section>

	<footer>
		<div class="grid">
			<div class="line"><small>Volunteer</small><span></span></div>
			<div class="line"><small>Entered in Pantrybook (initials)</small><span></span></div>
		</div>
	</footer>
</article>

<style>
	.intake {
		background: #fff;
		color: #111;
		border: 1px solid #bbb;
		border-radius: 8px;
		padding: 32px;
		max-width: 820px;
		margin: 0 auto;
		display: grid;
		gap: 22px;
		font-size: 11pt;
	}

	header {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		border-bottom: 2px solid #111;
		padding-bottom: 12px;
		flex-wrap: wrap;
	}

	h1 {
		font-size: 18pt;
	}

	h2 {
		font-size: 13pt;
		margin-bottom: 6px;
	}

	h3 {
		font-size: 11pt;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 10px;
		color: #333;
	}

	.title {
		text-align: right;
		display: grid;
		gap: 4px;
	}

	.box.short {
		display: inline-block;
		min-width: 140px;
		border-bottom: 1px solid #555;
		text-align: left;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px 24px;
	}

	.line {
		display: grid;
		gap: 2px;
	}

	.line.wide {
		grid-column: 1 / -1;
	}

	.line small {
		font-size: 8.5pt;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #444;
	}

	.line span {
		display: block;
		min-height: 26px;
		border-bottom: 1px solid #555;
		padding: 2px 0;
	}

	.line.split {
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.line.split > div {
		display: grid;
		gap: 2px;
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	.intake th,
	.intake tbody td {
		border: 1px solid #555;
		padding: 6px 8px;
		text-align: center;
		color: #111;
		background: #fff;
		font-size: 9pt;
	}

	td {
		height: 34px;
		font-size: 12pt;
	}

	.check {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-top: 12px;
	}

	.tick {
		width: 20px;
		height: 20px;
		border: 1.5px solid #333;
		display: inline-grid;
		place-items: center;
		font-weight: 700;
		flex: none;
	}

	.statement {
		border: 1px solid #999;
		border-radius: 6px;
		padding: 14px;
		display: grid;
		gap: 18px;
	}

	.signatures .line span {
		min-height: 34px;
	}

	footer {
		border-top: 1px dashed #999;
		padding-top: 12px;
	}

	@media print {
		.intake {
			border: 0;
			padding: 0;
			max-width: none;
		}
	}

	@media (max-width: 600px) {
		.intake {
			padding: 18px;
		}
		.grid {
			grid-template-columns: 1fr;
		}
		.title {
			text-align: left;
		}
	}
</style>
