import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('./use-setting-deep-link', () => ({ useSettingDeepLink: () => {} }))
vi.mock('@/lib/audio-context', () => ({ getAudioContext: vi.fn(() => null) }))
vi.mock('@/store/ambient', () => ({ ownsAmbientCue: vi.fn(async () => true) }))

import { getAudioContext } from '@/lib/audio-context'
import { playCompletionSound } from '@/lib/completion-sound'
import { ownsAmbientCue } from '@/store/ambient'
import { $completionSoundVariantId } from '@/store/completion-sound'
import { $hapticsMuted, setHapticsMuted } from '@/store/haptics'
import { $nativeNotifyPrefs } from '@/store/native-notifications'
import { NotificationsSettings } from './notifications-settings'

beforeEach(() => {
  setHapticsMuted(false)
  vi.clearAllMocks()
})
afterEach(cleanup)

it('lets the user mute interface sounds, persists it and prevents completion and preview audio', () => {
  const preset = $completionSoundVariantId.get()
  const notifications = $nativeNotifyPrefs.get()
  const { unmount } = render(<NotificationsSettings subpage="sounds" />)
  fireEvent.click(screen.getByRole('switch', { name: 'Interface sounds' }))
  expect($hapticsMuted.get()).toBe(true)
  expect(localStorage.getItem('hermes.desktop.hapticsMuted')).toBe('true')
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  playCompletionSound()
  expect(getAudioContext).not.toHaveBeenCalled()
  expect($completionSoundVariantId.get()).toBe(preset)
  expect($nativeNotifyPrefs.get()).toEqual(notifications)
  unmount()
  render(<NotificationsSettings subpage="sounds" />)
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  fireEvent.click(screen.getByRole('switch'))
  expect($hapticsMuted.get()).toBe(false)
  expect(localStorage.getItem('hermes.desktop.hapticsMuted')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(getAudioContext).toHaveBeenCalledTimes(1)
})

it('silences a completion cue even if it was queued before the mute', async () => {
  let resolveOwnership!: (owns: boolean) => void
  vi.mocked(ownsAmbientCue).mockReturnValueOnce(
    new Promise(resolve => {
      resolveOwnership = resolve
    })
  )
  playCompletionSound('pending-session')
  setHapticsMuted(true)
  await act(async () => {
    resolveOwnership(true)
  })
  expect(getAudioContext).not.toHaveBeenCalled()
})

it('keeps completion sounds available when enabled', async () => {
  playCompletionSound('enabled-session')
  await act(async () => {})
  expect(getAudioContext).toHaveBeenCalledTimes(1)
})
