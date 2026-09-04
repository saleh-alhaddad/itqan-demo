import { describe, it, expect } from 'vitest'
import { TINT_COUNT, tintFor, tintStyle } from '@/lib/tint'

describe('T10a — column tint mapping', () => {
  it('is deterministic: the same position is always the same tint', () => {
    for (const p of [0, 1, 2, 3, 4, 7, 12]) expect(tintFor(p)).toBe(tintFor(p))
  })

  it('gives each of the first five columns a distinct tint', () => {
    expect(new Set([0, 1, 2, 3, 4].map(tintFor)).size).toBe(TINT_COUNT)
  })

  it('cycles rather than running out — a sixth column reuses the first hue', () => {
    expect(tintFor(5)).toBe(tintFor(0))
    expect(tintFor(6)).toBe(tintFor(1))
    expect(tintFor(11)).toBe(tintFor(1))
  })

  it('never produces an index outside the defined scale', () => {
    for (let p = 0; p < 50; p++) {
      const n = tintFor(p)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(TINT_COUNT)
    }
  })

  it('survives a negative or non-integer position without producing NaN', () => {
    // Positions are dense integers from the database, but a board should not render
    // `--tint-NaN-surface` if that ever stops being true.
    for (const p of [-1, -7, 1.5, Number.NaN]) {
      const n = tintFor(p)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(TINT_COUNT)
    }
  })

  it('exposes the tint to CSS as two inherited custom properties', () => {
    const style = tintStyle(2) as Record<string, string>
    expect(style['--tint-surface']).toBe('var(--tint-3-surface)')
    expect(style['--tint-ink']).toBe('var(--tint-3-ink)')
  })
})
