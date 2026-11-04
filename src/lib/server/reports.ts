import { toCSV, type CsvValue } from '#lib/shared/csv.ts';
import { datesInRange, diffDays, monthsInRange } from '#lib/shared/dates.ts';
import type {
	Report,
	ReportOverLimitRow,
	ReportPeriodRow,
	ReportProgramRow,
	ReportZipRow
} from '#lib/shared/types.ts';
import { nowISO, type DB } from './db.ts';

export interface ReportQuery {
	from: string;
	to: string;
	programId: string | null;
}

function filter(q: ReportQuery, alias = 'v'): { sql: string; params: string[] } {
	const params = [q.from, q.to];
	let sql = `${alias}.voided = 0 AND ${alias}.visit_date BETWEEN ? AND ?`;
	if (q.programId) {
		sql += ` AND ${alias}.program_id = ?`;
		params.push(q.programId);
	}
	return { sql, params };
}

export function buildReport(db: DB, q: ReportQuery): Report {
	const f = filter(q);
	// Each household counts once, using its size at its latest visit in the range.
	const latestCte = `
		WITH v AS (SELECT * FROM visits v WHERE ${f.sql}),
		latest AS (
			SELECT household_id, adults, children, seniors,
				ROW_NUMBER() OVER (PARTITION BY household_id ORDER BY visit_date DESC, visited_at DESC) AS rn
			FROM v
		)`;

	const visitTotals = db
		.prepare(
			`SELECT COUNT(*) AS visits,
				COALESCE(SUM(adults + children + seniors), 0) AS individuals_duplicated,
				COALESCE(SUM(over_limit), 0) AS over_limit_visits
			 FROM visits v WHERE ${f.sql}`
		)
		.get(...f.params) as {
		visits: number;
		individuals_duplicated: number;
		over_limit_visits: number;
	};

	const people = db
		.prepare(
			`${latestCte}
			 SELECT COUNT(*) AS households,
				COALESCE(SUM(l.adults), 0) AS adults,
				COALESCE(SUM(l.children), 0) AS children,
				COALESCE(SUM(l.seniors), 0) AS seniors,
				COALESCE(SUM(h.income_eligible), 0) AS income_eligible_households
			 FROM latest l JOIN households h ON h.id = l.household_id
			 WHERE l.rn = 1`
		)
		.get(...f.params) as {
		households: number;
		adults: number;
		children: number;
		seniors: number;
		income_eligible_households: number;
	};

	const programClause = q.programId ? 'AND program_id = ?' : '';
	const firstVisitParams = q.programId ? [q.programId, q.from, q.to] : [q.from, q.to];
	const newHouseholds = db
		.prepare(
			`SELECT COUNT(*) AS n FROM (
				SELECT household_id, MIN(visit_date) AS first_visit FROM visits
				WHERE voided = 0 ${programClause}
				GROUP BY household_id
			 ) WHERE first_visit BETWEEN ? AND ?`
		)
		.get(...firstVisitParams) as { n: number };

	const byProgram = db
		.prepare(
			`WITH v AS (SELECT * FROM visits v WHERE ${f.sql}),
			latest AS (
				SELECT program_id, household_id, adults + children + seniors AS size,
					ROW_NUMBER() OVER (
						PARTITION BY program_id, household_id ORDER BY visit_date DESC, visited_at DESC
					) AS rn
				FROM v
			)
			SELECT p.id AS program_id, p.name, p.unit,
				(SELECT COUNT(*) FROM v WHERE v.program_id = p.id) AS visits,
				(SELECT COUNT(*) FROM latest l WHERE l.program_id = p.id AND l.rn = 1) AS households,
				(SELECT COALESCE(SUM(size), 0) FROM latest l WHERE l.program_id = p.id AND l.rn = 1)
					AS individuals,
				(SELECT COALESCE(SUM(quantity), 0) FROM v WHERE v.program_id = p.id) AS quantity
			FROM programs p
			WHERE p.id IN (SELECT DISTINCT program_id FROM v)
			ORDER BY p.sort_order, p.name`
		)
		.all(...f.params) as ReportProgramRow[];

	const granularity: 'day' | 'month' = diffDays(q.from, q.to) <= 62 ? 'day' : 'month';
	const periodLength = granularity === 'day' ? 10 : 7;
	const periodRows = db
		.prepare(
			`SELECT substr(visit_date, 1, ${periodLength}) AS period, COUNT(*) AS visits,
				COUNT(DISTINCT household_id) AS households
			 FROM visits v WHERE ${f.sql}
			 GROUP BY period ORDER BY period`
		)
		.all(...f.params) as ReportPeriodRow[];
	const periodMap = new Map(periodRows.map((r) => [r.period, r]));
	const allPeriods =
		granularity === 'day' ? datesInRange(q.from, q.to) : monthsInRange(q.from, q.to);
	const byPeriod = allPeriods.map(
		(period) => periodMap.get(period) ?? { period, visits: 0, households: 0 }
	);

	const byZip = db
		.prepare(
			`${latestCte}
			 SELECT COALESCE(NULLIF(TRIM(h.zip), ''), 'Not recorded') AS zip,
				COUNT(*) AS households,
				COALESCE(SUM(l.adults + l.children + l.seniors), 0) AS individuals,
				(SELECT COUNT(*) FROM v JOIN households h2 ON h2.id = v.household_id
				 WHERE COALESCE(NULLIF(TRIM(h2.zip), ''), 'Not recorded') =
				       COALESCE(NULLIF(TRIM(h.zip), ''), 'Not recorded')) AS visits
			 FROM latest l JOIN households h ON h.id = l.household_id
			 WHERE l.rn = 1
			 GROUP BY 1
			 ORDER BY households DESC, zip`
		)
		.all(...f.params) as ReportZipRow[];

	const overLimit = db
		.prepare(
			`SELECT v.id AS visit_id, v.visit_date, v.household_id, h.number AS household_number,
				TRIM(h.first_name || ' ' || h.last_name) AS household_name, p.name AS program_name,
				v.override_reason, COALESCE(u.display_name, '') AS recorded_by
			 FROM visits v
			 JOIN households h ON h.id = v.household_id
			 JOIN programs p ON p.id = v.program_id
			 LEFT JOIN users u ON u.id = v.created_by
			 WHERE ${f.sql} AND v.over_limit = 1
			 ORDER BY v.visit_date DESC, v.visited_at DESC
			 LIMIT 500`
		)
		.all(...f.params) as ReportOverLimitRow[];

	return {
		from: q.from,
		to: q.to,
		program_id: q.programId,
		granularity,
		totals: {
			visits: visitTotals.visits,
			households: people.households,
			individuals: people.adults + people.children + people.seniors,
			individuals_duplicated: visitTotals.individuals_duplicated,
			children: people.children,
			adults: people.adults,
			seniors: people.seniors,
			new_households: newHouseholds.n,
			income_eligible_households: people.income_eligible_households,
			over_limit_visits: visitTotals.over_limit_visits
		},
		by_program: byProgram,
		by_period: byPeriod,
		by_zip: byZip,
		over_limit: overLimit,
		generated_at: nowISO()
	};
}

/** A funder-friendly summary spreadsheet. */
export function reportToCSV(report: Report, orgName: string, programName: string | null): string {
	const t = report.totals;
	const rows: CsvValue[][] = [
		[`${orgName} — service report`],
		['Period', `${report.from} to ${report.to}`],
		['Program', programName ?? 'All programs'],
		['Generated', report.generated_at],
		[],
		['Measure', 'Value'],
		['Households served (unduplicated)', t.households],
		['Individuals served (unduplicated)', t.individuals],
		['  Children (0–17)', t.children],
		['  Adults (18–64)', t.adults],
		['  Seniors (65+)', t.seniors],
		['Individuals served (duplicated, counted per visit)', t.individuals_duplicated],
		['Visits', t.visits],
		['First-time households', t.new_households],
		['Income-eligible households (self-declared)', t.income_eligible_households],
		['Visits over the limit', t.over_limit_visits],
		[],
		['Program', 'Visits', 'Households', 'Individuals', 'Quantity', 'Unit'],
		...report.by_program.map((p) => [
			p.name,
			p.visits,
			p.households,
			p.individuals,
			p.quantity,
			p.unit
		]),
		[],
		['ZIP / postal code', 'Households', 'Individuals', 'Visits'],
		...report.by_zip.map((z) => [z.zip, z.households, z.individuals, z.visits]),
		[],
		[report.granularity === 'day' ? 'Date' : 'Month', 'Visits', 'Households'],
		...report.by_period.map((p) => [p.period, p.visits, p.households])
	];
	return toCSV(rows);
}

export function visitsCSV(db: DB, q: ReportQuery, includeVoided = true): string {
	const params: string[] = [q.from, q.to];
	let where = `v.visit_date BETWEEN ? AND ?`;
	if (!includeVoided) where += ` AND v.voided = 0`;
	if (q.programId) {
		where += ` AND v.program_id = ?`;
		params.push(q.programId);
	}
	const rows = db
		.prepare(
			`SELECT v.visit_date, v.visited_at, h.number, h.first_name, h.last_name, h.zip,
				p.name AS program, v.quantity, p.unit, v.adults, v.children, v.seniors,
				v.over_limit, v.override_reason, v.voided, v.void_reason,
				COALESCE(u.display_name, '') AS recorded_by, v.notes
			 FROM visits v
			 JOIN households h ON h.id = v.household_id
			 JOIN programs p ON p.id = v.program_id
			 LEFT JOIN users u ON u.id = v.created_by
			 WHERE ${where}
			 ORDER BY v.visit_date, v.visited_at`
		)
		.all(...params) as Record<string, string | number | null>[];
	return toCSV([
		[
			'Date',
			'Time (UTC)',
			'Household #',
			'First name',
			'Last name',
			'ZIP',
			'Program',
			'Quantity',
			'Unit',
			'Adults',
			'Children',
			'Seniors',
			'Household size',
			'Over limit',
			'Override reason',
			'Voided',
			'Void reason',
			'Recorded by',
			'Notes'
		],
		...rows.map((r) => [
			r.visit_date,
			String(r.visited_at).slice(11, 16),
			r.number,
			r.first_name,
			r.last_name,
			r.zip,
			r.program,
			r.quantity,
			r.unit,
			r.adults,
			r.children,
			r.seniors,
			Number(r.adults) + Number(r.children) + Number(r.seniors),
			r.over_limit === 1,
			r.override_reason,
			r.voided === 1,
			r.void_reason,
			r.recorded_by,
			r.notes
		])
	]);
}

export function householdsCSV(db: DB): string {
	const rows = db
		.prepare(
			`SELECT h.*, (SELECT MAX(visit_date) FROM visits v WHERE v.household_id = h.id AND v.voided = 0)
				AS last_visit,
				(SELECT COUNT(*) FROM visits v WHERE v.household_id = h.id AND v.voided = 0) AS visit_count
			 FROM households h WHERE h.deleted = 0
			 ORDER BY h.number`
		)
		.all() as Record<string, string | number | null>[];
	return toCSV([
		[
			'Household #',
			'First name',
			'Last name',
			'Phone',
			'Email',
			'Address',
			'City',
			'State',
			'ZIP',
			'Adults',
			'Children',
			'Seniors',
			'Household size',
			'Language',
			'Dietary needs',
			'Income eligible',
			'Status',
			'Last verified',
			'Registered',
			'Last visit',
			'Total visits',
			'Notes'
		],
		...rows.map((r) => [
			r.number,
			r.first_name,
			r.last_name,
			r.phone,
			r.email,
			r.address,
			r.city,
			r.state,
			r.zip,
			r.adults,
			r.children,
			r.seniors,
			Number(r.adults) + Number(r.children) + Number(r.seniors),
			r.language,
			r.dietary,
			r.income_eligible === 1,
			r.status,
			r.verified_at,
			String(r.created_at).slice(0, 10),
			r.last_visit ?? '',
			r.visit_count,
			r.notes
		])
	]);
}
