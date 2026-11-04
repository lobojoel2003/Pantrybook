/**
 * Small RFC 4180 CSV reader and writer, tolerant of what Excel and Google Sheets export:
 * byte-order marks, CRLF line endings, quoted fields with embedded newlines, and
 * comma, semicolon or tab delimiters.
 */

export type CsvValue = string | number | boolean | null | undefined;

function detectDelimiter(text: string): string {
	const firstLine = text.slice(0, text.search(/\r?\n|$/));
	const counts = [',', ';', '\t'].map((d) => ({
		d,
		n: firstLine.split(d).length - 1
	}));
	counts.sort((a, b) => b.n - a.n);
	return counts[0].n > 0 ? counts[0].d : ',';
}

export function parseCSV(input: string, delimiter?: string): string[][] {
	const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
	const sep = delimiter ?? detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				quoted = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}
		if (ch === '"' && field === '') {
			quoted = true;
			i += 1;
			continue;
		}
		if (ch === sep) {
			row.push(field);
			field = '';
			i += 1;
			continue;
		}
		if (ch === '\r' || ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
			continue;
		}
		field += ch;
		i += 1;
	}
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	// Drop blank lines (a single empty field).
	return rows.filter((r) => r.length > 1 || r[0].trim() !== '');
}

/** Characters that make spreadsheet apps treat a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function encodeField(value: CsvValue): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value === 'boolean') return value ? 'yes' : 'no';
	let text = value;
	// Neutralise formula injection when the file is opened in Excel or Sheets.
	if (FORMULA_START.test(text)) text = `'${text}`;
	if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
}

export function toCSV(rows: CsvValue[][]): string {
	return rows.map((row) => row.map(encodeField).join(',')).join('\r\n') + '\r\n';
}

/** Turn rows (first row = headers) into objects keyed by header. */
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
	if (rows.length === 0) return [];
	const headers = rows[0].map((h) => h.trim());
	return rows.slice(1).map((row) => {
		const obj: Record<string, string> = {};
		headers.forEach((h, i) => {
			obj[h] = (row[i] ?? '').trim();
		});
		return obj;
	});
}
