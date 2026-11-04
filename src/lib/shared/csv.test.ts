import { describe, expect, it } from 'vitest';
import { parseCSV, rowsToObjects, toCSV } from './csv.ts';

describe('csv', () => {
	it('parses quoted fields, escaped quotes and embedded newlines', () => {
		const rows = parseCSV('name,notes\r\n"Garcia, Maria","Said ""hi""\nthen left"\r\n');
		expect(rows).toEqual([
			['name', 'notes'],
			['Garcia, Maria', 'Said "hi"\nthen left']
		]);
	});

	it('strips a byte-order mark and skips blank lines', () => {
		expect(parseCSV('﻿a,b\n\n1,2\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('detects semicolon and tab delimiters', () => {
		expect(parseCSV('a;b\n1;2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
		expect(parseCSV('a\tb\n1\t2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('writes CSV that round-trips', () => {
		const data = [
			['Name', 'Count', 'Note'],
			['Smith, J', 3, 'a "quote"'],
			['Lee', 0, 'line\nbreak']
		];
		const text = toCSV(data);
		expect(parseCSV(text)).toEqual(data.map((r) => r.map(String)));
	});

	it('neutralises spreadsheet formulas but not numbers', () => {
		const text = toCSV([['=HYPERLINK("x")', '+1', -5, '@cmd']]);
		expect(text).toBe(`"'=HYPERLINK(""x"")",'+1,-5,'@cmd\r\n`);
	});

	it('maps rows to objects by header', () => {
		expect(
			rowsToObjects([
				['First ', 'Last'],
				[' Ana ', 'Diaz']
			])
		).toEqual([{ First: 'Ana', Last: 'Diaz' }]);
	});
});
