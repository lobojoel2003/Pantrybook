<script lang="ts">
	/**
	 * Single-series column chart with hover/focus tooltips.
	 * One color (no legend needed: the title names the series). Every value is also
	 * available in the table beneath it on the reports page.
	 */
	interface Datum {
		key: string;
		label: string;
		/** Short label for the x-axis. */
		tick: string;
		value: number;
		detail?: string;
	}

	interface Props {
		data: Datum[];
		height?: number;
		valueLabel: string;
		ariaLabel: string;
	}

	let { data, height = 220, valueLabel, ariaLabel }: Props = $props();

	let width = $state(640);
	let active = $state<number | null>(null);

	const margin = { top: 12, right: 8, bottom: 28, left: 40 };

	const max = $derived(Math.max(1, ...data.map((d) => d.value)));

	/** Clean, round tick values (0, 5, 10… or 0, 50, 100…). */
	const ticks = $derived.by(() => {
		const rough = max / 4;
		const magnitude = 10 ** Math.floor(Math.log10(rough));
		const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
		const top = Math.ceil(max / step) * step;
		const out: number[] = [];
		for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v));
		return out;
	});

	const yMax = $derived(ticks[ticks.length - 1] || 1);
	const innerW = $derived(Math.max(10, width - margin.left - margin.right));
	const innerH = $derived(height - margin.top - margin.bottom);
	const band = $derived(innerW / Math.max(1, data.length));
	const barW = $derived(Math.max(2, Math.min(24, band - 2)));

	/** Show at most ~10 x-axis labels so they never collide. */
	const tickEvery = $derived(
		Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 64))))
	);

	function y(value: number): number {
		return margin.top + innerH - (value / yMax) * innerH;
	}

	function barPath(i: number, value: number): string {
		const x = margin.left + i * band + (band - barW) / 2;
		const top = y(value);
		const bottom = margin.top + innerH;
		const h = bottom - top;
		if (h <= 0) return '';
		const r = Math.min(4, barW / 2, h);
		// Rounded data-end, square at the baseline.
		return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${bottom} Z`;
	}

	function format(n: number): string {
		return n.toLocaleString();
	}

	const tooltipX = $derived(
		active === null ? 0 : Math.min(Math.max(margin.left + active * band + band / 2, 70), width - 70)
	);
</script>

<div class="chart" bind:clientWidth={width}>
	<svg {width} {height} role="group" aria-label={ariaLabel}>
		{#each ticks as t (t)}
			<line
				class="grid"
				x1={margin.left}
				x2={width - margin.right}
				y1={y(t)}
				y2={y(t)}
				class:baseline={t === 0}
			/>
			<text class="axis" x={margin.left - 8} y={y(t)} dy="0.32em" text-anchor="end"
				>{format(t)}</text
			>
		{/each}

		{#each data as d, i (d.key)}
			<!-- Bars are focusable so keyboard users get the same tooltip as mouse users. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<g
				class="bar"
				class:active={active === i}
				role="img"
				tabindex="0"
				aria-label={`${d.label}: ${format(d.value)} ${valueLabel}`}
				onpointerenter={() => (active = i)}
				onpointerleave={() => (active = null)}
				onfocus={() => (active = i)}
				onblur={() => (active = null)}
			>
				<!-- Hit target is the whole band, taller than the painted bar. -->
				<rect class="hit" x={margin.left + i * band} y={margin.top} width={band} height={innerH} />
				<path d={barPath(i, d.value)} />
			</g>
			{#if i % tickEvery === 0}
				<text class="axis" x={margin.left + i * band + band / 2} y={height - 8} text-anchor="middle"
					>{d.tick}</text
				>
			{/if}
		{/each}
	</svg>

	{#if active !== null && data[active]}
		<div
			class="tooltip"
			style:left="{tooltipX}px"
			style:top="{Math.max(0, y(data[active].value) - 8)}px"
		>
			<strong>{format(data[active].value)}</strong>
			<span>{valueLabel}</span>
			<span class="when">{data[active].label}</span>
			{#if data[active].detail}<span class="when">{data[active].detail}</span>{/if}
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		user-select: none;
	}

	svg {
		overflow: visible;
	}

	.grid {
		stroke: var(--chart-grid);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.grid.baseline {
		stroke: var(--chart-axis);
	}

	.axis {
		fill: var(--text-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.bar path {
		fill: var(--chart-1);
		transition: fill 0.1s;
	}

	.bar.active path {
		fill: var(--chart-1-hover);
	}

	.bar .hit {
		fill: transparent;
	}

	.bar:focus-visible {
		outline: none;
	}

	.bar:focus-visible .hit {
		fill: color-mix(in srgb, var(--focus) 12%, transparent);
	}

	.tooltip {
		position: absolute;
		transform: translate(-50%, -100%);
		display: grid;
		gap: 1px;
		padding: 8px 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow);
		pointer-events: none;
		font-size: 0.82rem;
		white-space: nowrap;
		z-index: 2;
	}

	.tooltip strong {
		font-size: 1rem;
		color: var(--text);
	}

	.tooltip span {
		color: var(--text-muted);
	}

	.tooltip .when {
		color: var(--text-faint);
	}
</style>
