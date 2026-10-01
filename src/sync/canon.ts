/**
 * JSON with its keys sorted, for asking "is this the same data?".
 *
 * Postgres stores jsonb with its keys reordered, so a roster read back from the
 * database never stringifies the way the same roster just parsed does. Without
 * this every sync would look like a change.
 */
export function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
