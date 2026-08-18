export type Preference = 'light' | 'dark' | 'system'
export type Resolved = 'light' | 'dark'

const KEY = 'mdviewer-theme'

/** Resolve a stored preference to a concrete theme, given the OS dark-mode flag. */
export function resolveTheme(pref: Preference, prefersDark: boolean): Resolved {
  if (pref === 'system') return prefersDark ? 'dark' : 'light'
  return pref
}

/** Given the currently *resolved* theme, the explicit preference to switch to. */
export function nextPreference(current: Resolved): Preference {
  return current === 'light' ? 'dark' : 'light'
}

export function getStoredPreference(): Preference {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function storePreference(pref: Preference): void {
  localStorage.setItem(KEY, pref)
}

export function applyTheme(resolved: Resolved): void {
  document.documentElement.setAttribute('data-theme', resolved)
}
