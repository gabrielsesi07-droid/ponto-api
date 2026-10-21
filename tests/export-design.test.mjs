import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportData, createReportDocument, defaultReportOptions, exportReport } from '../lib/export.ts';

const issuedAt = new Date('2026-10-21T16:00:00Z');
const period = '2026-10-01 a 2026-10-31';
const minimal = Object.fromEntries(Object.keys(defaultReportOptions).map(key => [key, false]));
const all = Object.fromEntries(Object.keys(defaultReportOptions).map(key => [key, true]));
const entry = {
  id: 'entry-one', date: '2026-10-21', user_id: 'user-one', order_number: 4812,
  company: 'CLIENTE_PRIVADO', service: 'SERVICO_PRIVADO', start: '03:37', end: '18:54',
  break_minutes: 120, worked: 797, normal: 480, extra: 317,
  kind: 'TIPO_PRIVADO', work_type: 'travel', status: 'STATUS_PRIVADO',
  rate: 23.47, amount: 91337.47, rules: { currency: 'BRL' },
  breakdown: [{ minutes: 317, bonus: 60, amount: 91337.47 }],
  calculation_warning: 'OBSERVACAO_PRIVADA',
};
const state = {
  users: [{ id: 'user-one', name: 'PESSOA_DE_TESTE' }],
  settings: { currency: 'BRL' },
};

async function workbook(blob) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  return book;
}

function reportTable(book) {
  for (const sheet of book.worksheets) {
    for (let index = 1; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      if (row.getCell(1).value === 'Data' && row.getCell(2).value === 'Colaborador') {
        return { sheet, header: row, data: sheet.getRow(index + 1) };
      }
    }
  }
  assert.fail('A planilha precisa conter o cabeçalho dos lançamentos exportados.');
}

function excelSerial(value) {
  // ExcelJS reloads cells with a clock/date format as Date objects, even when
  // the workbook stores a numeric serial. Both remain usable in Excel sums.
  if (value instanceof Date) return (value.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  assert.equal(typeof value, 'number');
  return value;
}

async function documentText(format, options, rows = [entry], reportState = state) {
  const blob = await createReportDocument(format, rows, reportState, period, options, issuedAt);
  assert.ok(blob instanceof Blob);
  if (format === 'xlsx') return JSON.stringify((await workbook(blob)).worksheets.map(sheet => sheet.getSheetValues()));
  return await blob.text();
}

for (const format of ['csv', 'xlsx', 'pdf']) {
  test(`${format}: seleção mínima não vaza seções ocultas por meio de resumos ou rodapés`, async () => {
    const text = await documentText(format, minimal);
    assert.match(text, /PESSOA_DE_TESTE/);
    assert.doesNotMatch(text, /CLIENTE_PRIVADO|SERVICO_PRIVADO|TIPO_PRIVADO|STATUS_PRIVADO|OBSERVACAO_PRIVADA/);
    assert.doesNotMatch(text, /91[., ]?337[.,]47|BRL|03:37|18:54|13h 17|5h 17/);
    assert.doesNotMatch(text, /Trabalhadas|Normais|Extras|Deslocamento/);
  });

  test(`${format}: relatório padrão com faixas continua sem valores monetários`, async () => {
    const text = await documentText(format, { ...defaultReportOptions, breakdown: true });
    assert.match(text, /PESSOA_DE_TESTE/);
    assert.doesNotMatch(text, /91[., ]?337[.,]47|BRL|Valor extras estimado|Valores estimados/);
  });

  test(`${format}: ausência de valor-hora é preservada na seleção explícita de valores`, async () => {
    const row = { ...entry, rate: 0, missing_rate: true };
    const options = { ...minimal, values: true, breakdown: true };
    const data = buildReportData([row], state, options);
    assert.equal(data.data[0][data.headers.indexOf('Valor extras estimado')], '');
    assert.match(data.data[0][data.headers.indexOf('Conferência do valor')], /indisponível/);
    const text = await documentText(format, options, [row]);
    assert.doesNotMatch(text, /91[., ]?337[.,]47/);
    assert.match(text, /calcular|indispon/);
  });

  test(`${format}: relatório vazio ainda gera documento válido`, async () => {
    const blob = await createReportDocument(format, [], state, period, defaultReportOptions, issuedAt);
    assert.ok(blob.size > 40);
    if (format === 'csv') {
      assert.match(await blob.text(), /"Data";"Colaborador"/);
    } else if (format === 'xlsx') {
      const { header } = reportTable(await workbook(blob));
      assert.equal(header.getCell(1).value, 'Data');
    } else {
      assert.match(await blob.text(), /^%PDF-/);
    }
  });
}

test('Excel mantém números como números, texto literal e os filtros no cabeçalho correto', async () => {
  const dangerousName = '=HYPERLINK("https://example.invalid","texto literal")';
  const reportState = { ...state, users: [{ id: 'user-one', name: dangerousName }] };
  const blob = await createReportDocument('xlsx', [entry], reportState, period, all, issuedAt);
  const { sheet, header, data } = reportTable(await workbook(blob));
  const headers = header.values.slice(1);
  assert.equal(data.getCell(headers.indexOf('Colaborador') + 1).value, dangerousName);
  const date = data.getCell(headers.indexOf('Data') + 1).value;
  assert.ok(date instanceof Date);
  assert.equal(date.toISOString().slice(0, 10), '2026-10-21');
  assert.equal(excelSerial(data.getCell(headers.indexOf('Entrada') + 1).value), (3 * 60 + 37) / 1440);
  const worked = data.getCell(headers.indexOf('Trabalhadas') + 1);
  assert.equal(excelSerial(worked.value), 797 / 1440);
  assert.match(worked.numFmt, /\[h\]/i, 'As horas devem acumular sem voltar a zero após 24 horas.');
  assert.equal(typeof data.getCell(headers.indexOf('Intervalo min') + 1).value, 'number');
  assert.equal(data.getCell(headers.indexOf('Intervalo min') + 1).value, 120);
  assert.equal(typeof data.getCell(headers.indexOf('Valor extras estimado') + 1).value, 'number');
  assert.equal(data.getCell(headers.indexOf('Valor extras estimado') + 1).value, 91337.47);
  const frozen = sheet.views.find(view => view.state === 'frozen');
  assert.ok(frozen && frozen.ySplit >= header.number, 'O cabeçalho deve continuar visível durante a rolagem.');
  if (typeof sheet.autoFilter === 'string') {
    assert.match(sheet.autoFilter, new RegExp(`^A${header.number}:`));
  } else {
    assert.equal(sheet.autoFilter?.from.row, header.number);
    assert.equal(sheet.autoFilter?.from.column, 1);
    assert.equal(sheet.autoFilter?.to.column, headers.length);
    assert.equal(sheet.autoFilter?.to.row, header.number + 1);
  }
  assert.equal(sheet.pageSetup.printTitlesRow, `${header.number}:${header.number}`);
});

test('CSV preserva caracteres, campos multilinha e neutraliza fórmulas em textos', async () => {
  const name = '=2+2;"texto"\nsegunda linha';
  const reportState = { ...state, users: [{ id: 'user-one', name }] };
  const blob = await createReportDocument('csv', [entry], reportState, period, minimal, issuedAt);
  const text = await blob.text();
  assert.ok(text.includes('"\'=2+2;""texto""\nsegunda linha"'));
  assert.equal(text.includes('CLIENTE_PRIVADO'), false);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191], 'O BOM permite abrir os acentos no Excel.');
});

test('PDF e Excel preservam o último registro e suportam relatório com várias páginas', async () => {
  const rows = Array.from({ length: 95 }, (_, index) => ({
    ...entry, id: `entry-${index}`, company: `EMPRESA_${index}`,
    service: `Servico longo ${'de inspecao em campo '.repeat(5)}`,
    calculation_warning: `${'Observacao longa para conferir quebra de linha. '.repeat(6)} LINHA_${index}`,
  }));
  rows[rows.length - 1] = { ...rows.at(-1), company: 'ULTIMO_REGISTRO' };
  const pdf = await createReportDocument('pdf', rows, state, period, all, issuedAt);
  const text = await pdf.text();
  assert.match(text, /^%PDF-/);
  assert.ok((text.match(/\/Type\s*\/Page\b/g) || []).length > 1);
  assert.match(text, /ULTIMO_REGISTRO/);
  // PDF navigation dictionaries legitimately contain null coordinates.
  assert.doesNotMatch(text, /\bNaN\b|undefined|\(null\)\s*Tj/);
  const xlsx = await createReportDocument('xlsx', rows, state, period, all, issuedAt);
  const { sheet, header } = reportTable(await workbook(xlsx));
  const companyColumn = header.values.slice(1).indexOf('Empresa atendida') + 1;
  assert.equal(sheet.getRow(header.number + rows.length).getCell(companyColumn).value, 'ULTIMO_REGISTRO');
});

test('CSV identifica a moeda de cada estimativa e omite essa informação sem seleção de valores', async () => {
  const rows = [entry, { ...entry, id: 'entry-usd', rules: { currency: 'USD' }, amount: 129.43 }];
  const options = { ...minimal, values: true };
  const selected = buildReportData(rows, state, options);
  const currency = selected.headers.indexOf('Moeda');
  assert.ok(currency > selected.headers.indexOf('Conferência do valor'));
  assert.deepEqual(selected.data.map(row => row[currency]), ['BRL', 'USD']);
  const csv = await documentText('csv', options, rows);
  assert.match(csv, /;"BRL"(?:\r\n|$)/);
  assert.match(csv, /;"USD"(?:\r\n|$)/);
  const privateCsv = await documentText('csv', minimal, rows);
  assert.doesNotMatch(privateCsv, /Moeda|BRL|USD|129[.,]43|91[., ]?337[.,]47/);
});

test('Excel conserva as moedas individuais de registros com regras históricas diferentes', async () => {
  const rows = [entry, { ...entry, id: 'entry-usd', rules: { currency: 'USD' }, amount: 129.43 }];
  const blob = await createReportDocument('xlsx', rows, state, period, { ...minimal, values: true }, issuedAt);
  const { sheet, header } = reportTable(await workbook(blob));
  const headers = header.values.slice(1);
  const amountColumn = headers.indexOf('Valor extras estimado') + 1;
  const currencyColumn = headers.indexOf('Moeda') + 1;
  assert.equal(sheet.getRow(header.number + 1).getCell(currencyColumn).value, 'BRL');
  assert.equal(sheet.getRow(header.number + 2).getCell(currencyColumn).value, 'USD');
  assert.match(sheet.getRow(header.number + 1).getCell(amountColumn).numFmt, /R\$/);
  assert.match(sheet.getRow(header.number + 2).getCell(amountColumn).numFmt, /USD/);
  assert.equal(sheet.getRow(header.number + 2).getCell(amountColumn).value, 129.43);
});

test('CSV neutraliza fórmulas precedidas de espaços, quebras de linha ou BOM', async () => {
  const cases = [
    [' =2+2', "' =2+2"],
    ['\uFEFF  =2+2', "'\uFEFF  =2+2"],
    ['  +2+2', "'  +2+2"],
    ['  -2+2', "'  -2+2"],
    ['  @SUM(A1)', "'  @SUM(A1)"],
    ['\n=2+2', "'\n=2+2"],
    ['\ttexto', "'\ttexto"],
    ['\rtexto', "'\rtexto"],
    ['  Observacao segura', '  Observacao segura'],
  ];
  for (const [name, expected] of cases) {
    const reportState = { ...state, users: [{ id: 'user-one', name }] };
    const csv = await documentText('csv', minimal, [entry], reportState);
    assert.ok(csv.includes(`;"${expected}"`), `Texto deve permanecer seguro e preservado: ${JSON.stringify(name)}`);
  }
});

test('PDF associa detalhes a registros distintos da mesma pessoa no mesmo dia', async () => {
  const rows = [
    { ...entry, id: 'first', calculation_warning: 'CALCULO_PRIMEIRO' },
    { ...entry, id: 'second', calculation_warning: 'CALCULO_SEGUNDO' },
  ];
  const text = await documentText('pdf', { ...minimal, notes: true }, rows);
  assert.equal((text.match(/Ref\. 001/g) || []).length, 2);
  assert.equal((text.match(/Ref\. 002/g) || []).length, 2);
  const firstHeading = text.lastIndexOf('Ref. 001');
  const secondHeading = text.lastIndexOf('Ref. 002');
  assert.ok(firstHeading < text.indexOf('CALCULO_PRIMEIRO'));
  assert.ok(text.indexOf('CALCULO_PRIMEIRO') < secondHeading);
  assert.ok(secondHeading < text.indexOf('CALCULO_SEGUNDO'));
  assert.doesNotMatch(text, /CLIENTE_PRIVADO|SERVICO_PRIVADO|91337[.,]47|BRL/);
});

test('Excel preserva textos longos em partes legíveis sem recuperar seções desmarcadas', async () => {
  const service = 'Descrição técnica detalhada com acentuação, aspas "e texto"; local nº 42.\n'.repeat(25);
  assert.ok(service.length < 2000, 'O caso cobre um serviço permitido pelo formulário.');
  const rows = [{ ...entry, service }];
  const options = { ...minimal, service: true };
  const book = await workbook(await createReportDocument('xlsx', rows, state, period, options, issuedAt));
  const details = book.worksheets.find(sheet => sheet.name === 'Detalhes');
  assert.ok(details, 'Textos maiores que a altura máxima do Excel precisam de uma área legível.');
  let header;
  details.eachRow(row => {
    if (row.values.includes('Campo') && row.values.includes('Conteúdo')) header = row;
  });
  assert.ok(header);
  const headers = header.values.slice(1);
  const fieldColumn = headers.indexOf('Campo') + 1;
  const partColumn = headers.indexOf('Parte') + 1;
  const contentColumn = headers.indexOf('Conteúdo') + 1;
  const parts = [];
  details.eachRow(row => {
    if (row.number > header.number && row.getCell(fieldColumn).value === 'Serviço') {
      parts.push({ part: parseInt(row.getCell(partColumn).value, 10), value: row.getCell(contentColumn).value });
    }
  });
  assert.ok(parts.length > 1);
  assert.ok(parts.every(part => Number.isInteger(part.part) && typeof part.value === 'string'));
  assert.equal(parts.sort((a, b) => a.part - b.part).map(part => part.value).join(''), service);
  assert.doesNotMatch(JSON.stringify(book.worksheets.map(sheet => sheet.getSheetValues())), /91337[.,]47|BRL|OBSERVACAO_PRIVADA|STATUS_PRIVADO|TIPO_PRIVADO/);
  const privateBook = await workbook(await createReportDocument('xlsx', rows, state, period, minimal, issuedAt));
  assert.equal(privateBook.worksheets.some(sheet => sheet.name === 'Detalhes'), false);
  assert.doesNotMatch(JSON.stringify(privateBook.worksheets.map(sheet => sheet.getSheetValues())), /Descrição técnica|CLIENTE_PRIVADO|Moeda|BRL/);
});

test('download usa nome legível do período e a extensão correta sem dados pessoais', async () => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalTimeout = globalThis.setTimeout;
  const anchors = [];
  const blobs = [];
  globalThis.document = { createElement: () => {
    const anchor = { click() { this.clicked = true; } };
    anchors.push(anchor);
    return anchor;
  } };
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:export-filename-test'; };
  URL.revokeObjectURL = () => {};
  globalThis.setTimeout = callback => { callback(); return 0; };
  try {
    for (const format of ['csv', 'xlsx', 'pdf']) {
      await exportReport(format, [entry], state, period, minimal);
    }
    assert.deepEqual(anchors.map(anchor => anchor.download), [
      'horacerta-jornada-2026-10-01-a-2026-10-31.csv',
      'horacerta-jornada-2026-10-01-a-2026-10-31.xlsx',
      'horacerta-jornada-2026-10-01-a-2026-10-31.pdf',
    ]);
    assert.ok(anchors.every(anchor => anchor.clicked));
    assert.ok(blobs.every(blob => blob instanceof Blob && blob.size > 40));
    assert.doesNotMatch(anchors.map(anchor => anchor.download).join(' '), /PESSOA|user-one|CLIENTE/);
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globalThis.setTimeout = originalTimeout;
  }
});
