/**
 * Command-palette contribution surface — `palette` data contributions become
 * rows in the ⌘K root list, same schema as every other area. Contributions
 * with an `action` id render that action's live keybind as their hotkey hint.
 */

import { useContributions } from '@/contrib/react/use-contributions'
import type { IconComponent } from '@/lib/icons'

export const PALETTE_AREA = 'palette'

/** Payload of a `palette` data contribution. */
export interface PaletteContribution {
  id: string
  label: string
  /** Keybind action id — its live combo renders as the hotkey hint. */
  action?: string
  icon?: IconComponent
  keywords?: string[]
  run: () => void
  /**
   * Renders a trailing check when this row IS the current state — the way an
   * on/off pair shows which half is live. Read as a function, not a boolean,
   * because contributions are registered once at boot while the state they
   * describe keeps moving; the palette evaluates it each time it opens.
   */
  active?: () => boolean
}

/** Contributed palette rows, with stable render keys. */
export function usePaletteContributions(): Array<PaletteContribution & { key: string }> {
  return useContributions(PALETTE_AREA)
    .map(c => ({ key: `${c.source ?? 'core'}:${c.id}`, ...(c.data as PaletteContribution) }))
    .filter(item => Boolean(item.label && item.run))
}

/**
 * Expand a binary setting into the PAIR of palette rows it deserves:
 * `<label> on` and `<label> off`, checked on whichever half is live.
 *
 * One "Toggle X" row is a coin flip — it names neither the current state nor
 * the destination, and a palette row (unlike a slash command) has nowhere to
 * type `on`. Putting the word in the label is also what lets typing "off" rank
 * onto the off row. `label` is the bare noun ("Status bar"), never "Toggle X".
 */
export function paletteToggle(
  spec: Omit<PaletteContribution, 'active' | 'id' | 'label' | 'run'> & {
    id: string
    label: string
    get: () => boolean
    set: (enabled: boolean) => void
  }
) {
  const { get, id, keywords = [], label, set, ...rest } = spec

  return [true, false].map(enabled => {
    const data: PaletteContribution = {
      ...rest,
      active: () => get() === enabled,
      id: `${id}.${enabled ? 'on' : 'off'}`,
      keywords: [...keywords, enabled ? 'on' : 'off', enabled ? 'enable' : 'disable'],
      label: `${label} ${enabled ? 'on' : 'off'}`,
      run: () => set(enabled)
    }

    return { id: data.id, area: PALETTE_AREA, data }
  })
}
