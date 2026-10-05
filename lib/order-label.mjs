/** The official document reference is a label, never a relational identifier. */
/** @param {number} number @param {string | null | undefined} [official] */
export function orderLabel(number, official) {
  const value = official?.trim();
  return value ? (/^OS(?:[\s-]|$)/i.test(value) ? value : `OS ${value}`) : `OS-${String(number).padStart(6, "0")}`;
}
