import { describe, it, expect, beforeEach } from 'vitest'
import { resolveTheme, nextPreference, getStoredPreference, applyTheme } from './theme'

beforeEach(() => localStorage.clear())

describe('resolveTheme', () => {
  it('maps system to dark/light based on OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('returns explicit preference unchanged', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('nextPreference', () => {
  it('toggles the resolved theme to the opposite explicit value', () => {
    expect(nextPreference('light')).toBe('dark')
    expect(nextPreference('dark')).toBe('light')
  })
})

describe('getStoredPreference', () => {
  it('defaults to system when nothing stored', () => {
    expect(getStoredPreference()).toBe('system')
  })
  it('reads a stored value', () => {
    localStorage.setItem('mdviewer-theme', 'dark')
    expect(getStoredPreference()).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('sets the data-theme attribute on the root element', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
