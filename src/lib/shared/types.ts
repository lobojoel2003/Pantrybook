/**
 * Types shared by the browser app and the server.
 * Dates are `YYYY-MM-DD` strings (the pantry's local date); timestamps are ISO-8601 strings.
 */

export type Role = 'admin' | 'volunteer';

/** How a program's visit limit is counted. */
export type LimitPeriod = 'day' | 'week' | 'month' | 'year' | 'rolling';

/** Who may record a visit after a household has reached a program's limit. */
export type OverridePolicy = 'anyone' | 'admin' | 'never';

export type HouseholdStatus = 'active' | 'inactive';

/** The fields a volunteer can edit on the intake form. */
export interface HouseholdInput {
	first_name: string;
	last_name: string;
	phone: string;
	email: string;
	address: string;
	city: string;
	state: string;
	zip: string;
	adults: number;
	children: number;
	seniors: number;
	language: string;
	dietary: string;
	notes: string;
	income_eligible: boolean;
	status: HouseholdStatus;
	/** Date the household's information was last confirmed (`YYYY-MM-DD`), or empty. */
	verified_at: string;
}

export interface Household extends HouseholdInput {
	id: string;
	/** Short, human-friendly number assigned by the server. `null` until the household syncs. */
	number: number | null;
	created_at: string;
	updated_at: string;
	deleted: boolean;
	rev: number;
}

export interface VisitInput {
	id: string;
	household_id: string;
	program_id: string;
	visit_date: string;
	visited_at: string;
	quantity: number | null;
	notes: string;
	override_reason: string;
}

export interface Visit extends VisitInput {
	/** Household size at the time of the visit (used for reporting). */
	adults: number;
	children: number;
	seniors: number;
	over_limit: boolean;
	voided: boolean;
	void_reason: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	rev: number;
}

export interface ProgramInput {
	name: string;
	/** What quantity measures (for example `lbs`, `items`, `bags`). Empty means "don't ask". */
	unit: string;
	default_quantity: number | null;
	limit_count: number | null;
	limit_period: LimitPeriod | null;
	/** Window length for `rolling` limits. */
	limit_days: number | null;
	active: boolean;
	sort_order: number;
}

export interface Program extends ProgramInput {
	id: string;
	updated_at: string;
	rev: number;
}

export interface Settings {
	org_name: string;
	org_address: string;
	org_phone: string;
	override_policy: OverridePolicy;
	/** 0 = weeks start on Sunday, 1 = Monday. */
	week_starts_on: 0 | 1;
	/** Ask volunteers to re-confirm household details after this many months (0 = never). */
	recertify_months: number;
	/** Statement printed on the intake form above the signature line. */
	intake_statement: string;
}

export interface PublicUser {
	id: string;
	username: string;
	display_name: string;
	role: Role;
	active: boolean;
	created_at: string;
	last_login_at: string | null;
}

export interface Me {
	id: string;
	username: string;
	display_name: string;
	role: Role;
}

export interface UserName {
	id: string;
	display_name: string;
}

export interface BuildInfo {
	version: string;
	buildNumber: string;
	commit: string;
	builtAt: string;
	channel: string;
}

/* ---------------------------------------------------------------- sync -- */

export interface SyncPullResponse {
	/** Identifies this database. When it changes, clients discard their local copy. */
	server_id: string;
	/** Cursor to send as `since` on the next pull. */
	rev: number;
	/** `true` when more changes are waiting; pull again with the new cursor. */
	more: boolean;
	households: Household[];
	visits: Visit[];
	programs: Program[];
	settings: Settings;
	users: UserName[];
	/** Oldest visit date included in a full (since = 0) pull. */
	visit_window_start: string;
}

export type Mutation =
	| {
			id: string;
			type: 'household.save';
			at: string;
			data: HouseholdInput & { id: string; updated_at: string };
	  }
	| { id: string; type: 'visit.create'; at: string; data: VisitInput }
	| { id: string; type: 'visit.void'; at: string; data: { id: string; reason: string } };

export type MutationType = Mutation['type'];

export interface MutationResult {
	id: string;
	ok: boolean;
	/** Human-readable error when `ok` is false. */
	error?: string;
	/** `true` when retrying will never succeed (bad data, missing household). */
	permanent?: boolean;
	/** Non-fatal notes, such as a visit that was recorded over its limit. */
	warnings?: string[];
	household?: Household;
	visit?: Visit;
}

export interface SyncPushResponse {
	results: MutationResult[];
}

/* ------------------------------------------------------------- reports -- */

export interface ReportTotals {
	visits: number;
	households: number;
	individuals: number;
	individuals_duplicated: number;
	children: number;
	adults: number;
	seniors: number;
	new_households: number;
	income_eligible_households: number;
	over_limit_visits: number;
}

export interface ReportProgramRow {
	program_id: string;
	name: string;
	unit: string;
	visits: number;
	households: number;
	individuals: number;
	quantity: number;
}

export interface ReportPeriodRow {
	/** `YYYY-MM-DD` for daily buckets, `YYYY-MM` for monthly buckets. */
	period: string;
	visits: number;
	households: number;
}

export interface ReportZipRow {
	zip: string;
	households: number;
	individuals: number;
	visits: number;
}

export interface ReportOverLimitRow {
	visit_id: string;
	visit_date: string;
	household_id: string;
	household_number: number | null;
	household_name: string;
	program_name: string;
	override_reason: string;
	recorded_by: string;
}

export interface Report {
	from: string;
	to: string;
	program_id: string | null;
	granularity: 'day' | 'month';
	totals: ReportTotals;
	by_program: ReportProgramRow[];
	by_period: ReportPeriodRow[];
	by_zip: ReportZipRow[];
	over_limit: ReportOverLimitRow[];
	generated_at: string;
}

/* --------------------------------------------------------------- misc -- */

export interface ApiError {
	error: string;
	issues?: string[];
}

export interface SessionInfo {
	setup_required: boolean;
	demo: boolean;
	user: Me | null;
	org_name: string;
}

export interface ImportRow {
	first_name: string;
	last_name: string;
	phone?: string;
	email?: string;
	address?: string;
	city?: string;
	state?: string;
	zip?: string;
	adults?: number;
	children?: number;
	seniors?: number;
	language?: string;
	dietary?: string;
	notes?: string;
	income_eligible?: boolean;
}

export interface ImportResult {
	imported: number;
	skipped: number;
	errors: { row: number; error: string }[];
}
