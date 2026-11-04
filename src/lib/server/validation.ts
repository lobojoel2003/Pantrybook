import { z } from 'zod';

const text = (max: number) => z.string().max(max);
const count = z.number().int().min(0).max(30);

export const householdFields = {
	first_name: text(200),
	last_name: text(200),
	phone: text(100),
	email: text(200),
	address: text(400),
	city: text(200),
	state: text(100),
	zip: text(40),
	adults: count,
	children: count,
	seniors: count,
	language: text(100),
	dietary: text(1000),
	notes: text(5000),
	income_eligible: z.boolean(),
	status: z.enum(['active', 'inactive']),
	verified_at: z.union([z.literal(''), z.iso.date()])
};

export const householdSaveSchema = z.object({
	id: z.uuid(),
	updated_at: z.iso.datetime({ offset: true }),
	...householdFields
});

export const visitCreateSchema = z.object({
	id: z.uuid(),
	household_id: z.uuid(),
	program_id: z.string().min(1).max(100),
	visit_date: z.iso.date(),
	visited_at: z.iso.datetime({ offset: true }),
	quantity: z.number().min(0).max(1_000_000).nullable(),
	notes: text(2000),
	override_reason: text(500)
});

export const visitVoidSchema = z.object({
	id: z.uuid(),
	reason: text(500)
});

export const mutationSchema = z.discriminatedUnion('type', [
	z.object({
		id: z.string().min(1).max(100),
		type: z.literal('household.save'),
		at: z.string(),
		data: z.unknown()
	}),
	z.object({
		id: z.string().min(1).max(100),
		type: z.literal('visit.create'),
		at: z.string(),
		data: z.unknown()
	}),
	z.object({
		id: z.string().min(1).max(100),
		type: z.literal('visit.void'),
		at: z.string(),
		data: z.unknown()
	})
]);

export const pushSchema = z.object({
	mutations: z.array(z.unknown()).max(500)
});

export const programSchema = z
	.object({
		name: z.string().trim().min(1, 'Give the program a name.').max(80),
		unit: z.string().trim().max(20),
		default_quantity: z.number().min(0).max(100_000).nullable(),
		limit_count: z.number().int().min(1).max(1000).nullable(),
		limit_period: z.enum(['day', 'week', 'month', 'year', 'rolling']).nullable(),
		// Devices keep about 400 days of visits offline, so rolling windows stay within a year.
		limit_days: z.number().int().min(1).max(366).nullable(),
		active: z.boolean(),
		sort_order: z.number().int().min(0).max(10_000)
	})
	.refine((p) => (p.limit_count === null) === (p.limit_period === null), {
		message: 'Set both a number of visits and a period, or neither.'
	})
	.refine((p) => p.limit_period !== 'rolling' || p.limit_days !== null, {
		message: 'Rolling limits need a number of days.'
	});

export const settingsSchema = z.object({
	org_name: z.string().trim().min(1, 'Enter your organization name.').max(120),
	org_address: z.string().trim().max(300),
	org_phone: z.string().trim().max(60),
	override_policy: z.enum(['anyone', 'admin', 'never']),
	week_starts_on: z.union([z.literal(0), z.literal(1)]),
	recertify_months: z.number().int().min(0).max(60),
	intake_statement: z.string().trim().max(2000)
});

export const usernameSchema = z
	.string()
	.trim()
	.min(2, 'Usernames need at least 2 characters.')
	.max(40)
	.regex(/^[a-zA-Z0-9._-]+$/, 'Use only letters, numbers, dots, dashes and underscores.');

export const createUserSchema = z.object({
	username: usernameSchema,
	display_name: z.string().trim().min(1, 'Enter a name.').max(80),
	role: z.enum(['admin', 'volunteer']),
	password: z.string().max(200)
});

export const updateUserSchema = z.object({
	display_name: z.string().trim().min(1).max(80).optional(),
	role: z.enum(['admin', 'volunteer']).optional(),
	active: z.boolean().optional(),
	password: z.string().max(200).optional()
});

export const setupSchema = z.object({
	org_name: z.string().trim().min(1, 'Enter your organization name.').max(120),
	username: usernameSchema,
	display_name: z.string().trim().min(1, 'Enter your name.').max(80),
	password: z.string().max(200)
});

export const loginSchema = z.object({
	username: z.string().trim().min(1).max(100),
	password: z.string().min(1).max(500)
});

export const changePasswordSchema = z.object({
	current_password: z.string().min(1).max(500),
	new_password: z.string().max(200)
});

export const importSchema = z.object({
	rows: z
		.array(
			z.object({
				first_name: z.string().max(500).default(''),
				last_name: z.string().max(500).default(''),
				phone: z.string().max(500).optional(),
				email: z.string().max(500).optional(),
				address: z.string().max(1000).optional(),
				city: z.string().max(500).optional(),
				state: z.string().max(500).optional(),
				zip: z.string().max(100).optional(),
				adults: z.number().int().optional(),
				children: z.number().int().optional(),
				seniors: z.number().int().optional(),
				language: z.string().max(500).optional(),
				dietary: z.string().max(2000).optional(),
				notes: z.string().max(10_000).optional(),
				income_eligible: z.boolean().optional()
			})
		)
		.max(1_000),
	skip_duplicates: z.boolean().default(true),
	/** Spreadsheet row number of the first row in this batch. */
	row_offset: z.number().int().min(1).default(2)
});

/** Flatten zod issues into short sentences for the UI. */
export function issuesOf(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
		return `${where}${issue.message}`;
	});
}
