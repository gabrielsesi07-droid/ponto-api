import test from 'node:test';
import assert from 'node:assert/strict';
import { entryTimeIssue } from '../lib/entry-time-feedback.ts';
import { workedMinutes } from '../lib/manual-work.ts';

test('Saída igual ou anterior à entrada gera mensagem específica', () => {
  assert.match(entryTimeIssue('08:00', '07:30', 0), /saída deve ser depois da entrada/);
  assert.match(entryTimeIssue('08:00', '08:00', 0), /saída deve ser depois da entrada/);
});

test('Intervalo maior ou igual à jornada gera mensagem própria', () => {
  assert.match(entryTimeIssue('08:00', '09:00', 60), /intervalo deve ser menor/);
  assert.equal(entryTimeIssue('08:00', '09:00', 59), null);
});

test('Formato incompleto ou inválido fica com a validação nativa', () => {
  for (const [start, end] of [['08:00', ''], ['08:00', '25:00'], ['', '10:00'], ['08:00', '9:00']])
    assert.equal(entryTimeIssue(start, end, 0), null);
});

test('Sem mensagem exatamente quando há tempo de trabalho calculável', () => {
  for (const [start, end, pause] of [['08:00', '10:30', 0], ['08:00', '24:00', 60], ['22:00', '24:00', 0], ['08:00', '17:00', 60]]) {
    assert.equal(entryTimeIssue(start, end, pause), null);
    assert.notEqual(workedMinutes(start, end, pause), null);
  }
  for (const [start, end, pause] of [['08:00', '07:00', 0], ['08:00', '09:00', 60]]) {
    assert.notEqual(entryTimeIssue(start, end, pause), null);
    assert.equal(workedMinutes(start, end, pause), null);
  }
});
