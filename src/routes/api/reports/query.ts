import { ApiFail, dateParam } from '#lib/server/api.ts';
import type { DB } from '#lib/server/db.ts';
import { getProgram } from '#lib/server/programs.ts';
import { diffDays } from '#lib/shared/dates.ts';
import type { ReportQuery } from '#lib/server/reports.ts';

export function reportQuery(db: DB, url: URL): ReportQuery & { programName: string | null } {
	const from = dateParam(url, 'from');
	const to = dateParam(url, 'to');
	if (from > to) throw new ApiFail(400, 'The start date must be before the end date.');
	if (diffDays(from, to) > 3700) throw new ApiFail(400, 'Choose a range of ten years or less.');
	const programId = url.searchParams.get('program') || null;
	let programName: string | null = null;
	if (programId) {
		const program = getProgram(db, programId);
		if (!program) throw new ApiFail(400, 'Unknown program.');
		programName = program.name;
	}
	return { from, to, programId, programName };
}
