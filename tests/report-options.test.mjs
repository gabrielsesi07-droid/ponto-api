import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportData, defaultReportOptions, exportReport } from '../lib/export.ts';

const row = { date: '2026-10-21', user_id: 'u', start: '07:00', end: '18:00', break_minutes: 60,
  worked: 600, normal: 480, extra: 120, kind: 'Dia útil', status: 'Aprovado', rate: 20,
  amount: 64, rules: { currency: 'BRL' }, breakdown: [{ minutes: 120, bonus: 60, amount: 64 }] };
const state = { users: [{ id: 'u', name: 'Colaborador teste' }], settings: { currency: 'BRL' } };

test('relatório padrão e faixas opcionais não expõem estimativas monetárias', () => {
  const result = buildReportData([row], state, { ...defaultReportOptions, breakdown: true, notes: true });
  assert.ok(!result.headers.some(header => /valor/i.test(header)));
  assert.ok(!JSON.stringify(result.data).includes('64'));
  assert.ok(!JSON.stringify(result.data).includes('BRL'));
  assert.ok(result.data[0].includes('2h 00 com +60%'));
});

test('seleção mínima conserva somente data e colaborador; valores exigem seleção explícita', () => {
  const none = Object.fromEntries(Object.keys(defaultReportOptions).map(key => [key, false]));
  assert.deepEqual(buildReportData([row], state, none), { headers: ['Data', 'Colaborador'], data: [['2026-10-21', 'Colaborador teste']] });
  const result = buildReportData([{ ...row, missing_rate: true }], state, { ...none, values: true });
  assert.equal(result.data[0][2], '');
  assert.match(result.data[0][3], /não informado/);
});

test('PDF, Excel e CSV exportam as colunas selecionadas sem valores por padrão', async () => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const blobs = [];
  globalThis.document = { createElement: () => ({ click() {} }) };
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:report-test'; };
  try {
    for (const format of ['csv', 'xlsx', 'pdf']) await exportReport(format, [row], state, '2026-10');
    const csv = await blobs[0].text();
    assert.match(csv, /Colaborador teste/);
    assert.doesNotMatch(csv, /Valor|64|BRL/);
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blobs[1].arrayBuffer());
    assert.doesNotMatch(JSON.stringify(book.worksheets[0].getSheetValues()), /Valor|64|BRL/);
    const pdf = await blobs[2].text();
    assert.ok(pdf.startsWith('%PDF'));
    assert.doesNotMatch(pdf, /Valores estimados|Moeda:|BRL/);
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
  }
});
