// Tema: scuro se non si è mai scelto nulla; «auto» segue il telefono.
const FIXED = new Set(['dark', 'light']);

export function resolveTheme(stored, systemDark) {
  if (stored === 'auto') return systemDark ? 'dark' : 'light';
  return FIXED.has(stored) ? stored : 'dark';
}

// Colore della barra di sistema e dello sfondo d'avvio: uguale allo sfondo dell'app.
export const THEME_COLOR = { dark: '#000000', light: '#F4F4F5' };
