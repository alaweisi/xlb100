/** City config version helpers */
export function nextConfigVersion(current: number): number {
  return current + 1;
}

export function isSameConfigVersion(a: number, b: number): boolean {
  return a === b;
}
