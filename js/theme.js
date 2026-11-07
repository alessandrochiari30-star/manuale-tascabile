// Tema: scuro se non si è mai scelto nulla; «auto» segue il telefono.
const FIXED = new Set(['dark', 'light']);

export function resolveTheme(stored, systemDark) {
  if (stored === 'auto') return systemDark ? 'dark' : 'light';
  return FIXED.has(stored) ? stored : 'dark';
}
