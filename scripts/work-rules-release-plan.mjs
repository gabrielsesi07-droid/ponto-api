import { readFile } from 'node:fs/promises';

export function releaseMode(args, defaultMode = 'all') {
  const modes = args.filter(arg => arg === '--prepare' || arg === '--activate');
  if (modes.length > 1) throw new Error('Escolha somente --prepare ou --activate.');
  return modes[0]?.slice(2) ?? defaultMode;
}

export function splitWorkRulesMigration(source, mode = 'all') {
  if (!['all', 'prepare', 'activate'].includes(mode)) throw new Error('Etapa de migração inválida.');
  const statements = source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim());
  const activation = statements.at(-1);
  if (!activation?.includes("name='024-work-rules'") || !activation.includes('UPDATE horacerta.settings'))
    throw new Error('O último bloco da migração 024 precisa conter somente a ativação versionada das regras.');
  const preparation = statements.slice(0, -1);
  if (preparation.some(s => s.includes('UPDATE horacerta.settings')))
    throw new Error('A preparação não pode ativar as regras de cálculo.');
  return mode === 'activate' ? [activation] : mode === 'prepare' ? preparation : statements;
}

export async function workRulesReleaseStatements(mode = 'all', includeSchedule = false) {
  const source = await readFile(new URL('../sql/024-work-rules.sql', import.meta.url), 'utf8');
  const statements = splitWorkRulesMigration(source, mode);
  if (includeSchedule && mode !== 'activate') {
    const schedule = await readFile(new URL('../sql/025-order-scheduling.sql', import.meta.url), 'utf8');
    statements.push(...schedule.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()));
  }
  return statements;
}
