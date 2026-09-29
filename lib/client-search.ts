export type ClientSuggestion = { id: string | null; name: string; detail?: string };
export function clientNameKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length];
}
export function searchClients(options: ClientSuggestion[], query: string) {
  const key = clientNameKey(query), words = key.split(' ');
  if (key.length < 2) return [];
  return options.map(option => {
    const name = clientNameKey(option.name);
    const score = name === key ? 0 : name.startsWith(key) ? 1 : words.every(word => name.includes(word)) ? 2
      : key.length >= 5 && Math.abs(name.length - key.length) <= 2 && distance(name, key) <= 2 ? 3 : 99;
    return { option, score };
  }).filter(item => item.score < 99).sort((a, b) => a.score - b.score || Number(!a.option.id) - Number(!b.option.id) || a.option.name.localeCompare(b.option.name, 'pt-BR')).slice(0, 8).map(item => item.option);
}
