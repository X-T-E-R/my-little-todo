export function isMilkdownSlashMenuClassName(value: string | null | undefined): boolean {
  if (!value) return false;
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .includes('milkdown-slash-menu');
}
