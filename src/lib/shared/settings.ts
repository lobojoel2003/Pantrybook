import type { Settings } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
	org_name: 'Our Pantry',
	org_address: '',
	org_phone: '',
	override_policy: 'anyone',
	week_starts_on: 0,
	recertify_months: 12,
	intake_statement:
		'I certify that the information above is true and that my household is in need of assistance. ' +
		'I understand that this information is kept private and used only to provide services and to ' +
		'report total numbers served.'
};

export const OVERRIDE_POLICIES = [
	{ value: 'anyone', label: 'Anyone, with a reason' },
	{ value: 'admin', label: 'Coordinators (admins) only' },
	{ value: 'never', label: 'Nobody — always block' }
] as const;
