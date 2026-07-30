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
  /**
   * Row text. A function when the row describes live state — contributions are
   * registered once at boot while the thing they name keeps moving, so the
   * palette re-reads it on open.
   */
  label: (() => string) | string
  /** Keybind action id — its live combo renders as the hotkey hint. */
  action?: string
  icon?: IconComponent
  keywords?: string[]
  run: () => void
}

/** Contributed palette rows, with stable render keys. */
export function usePaletteContributions(): Array<PaletteContribution & { key: string }> {
  return useContributions(PALETTE_AREA)
    .map(c => ({ key: `${c.source ?? 'core'}:${c.id}`, ...(c.data as PaletteContribution) }))
    .filter(item => Boolean(item.label && item.run))
}

/**
 * A binary setting as one palette row that names what picking it will DO:
 * `YOLO on` while it's off, `YOLO off` while it's on.
 *
 * "Toggle X" is a coin flip — it names neither the current state nor the
 * destination, and a palette row (unlike a slash command) has nowhere to type
 * `on`. `label` is the bare noun ("Status bar"); the direction is appended.
 */
export function paletteToggle(
  spec: Omit<PaletteContribution, 'label' | 'run'> & {
    label: string
    get: () => boolean
    set: (enabled: boolean) => void
  }
) {
  const { get, keywords = [], label, set, ...rest } = spec

  const data: PaletteContribution = {
    ...rest,
    keywords: [...keywords, 'on', 'off', 'enable', 'disable'],
    label: () => `${label} ${get() ? 'off' : 'on'}`,
    run: () => set(!get())
  }

  return { id: data.id, area: PALETTE_AREA, data }
}
