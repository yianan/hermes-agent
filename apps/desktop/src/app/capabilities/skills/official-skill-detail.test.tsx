import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    isLoading: false,
    data: {
      skill_md:
        '---\nname: catalog-example\n---\n# Catalog workflow\n\n- **Read** the sources\n\n| Item | Value |\n| --- | --- |\n| Count | 42 |'
    }
  })
}))

import type { OfficialSkillInfo } from '@/types/hermes'
import { PanelBlock } from '../../overlays/panel'
import { OfficialSkillDetail } from './official-skill-detail'

afterEach(cleanup)

it('renders catalog skill documents through the same Markdown viewer as installed skills', () => {
  render(
    <OfficialSkillDetail
      installing={false}
      onInstall={() => {}}
      skill={
        {
          identifier: 'example',
          name: 'Example',
          description: '**Useful** workflow',
          category: 'research'
        } as OfficialSkillInfo
      }
    />
  )
  expect(screen.getByRole('heading', { name: 'Catalog workflow' })).toBeTruthy()
  expect(screen.getByRole('listitem').textContent).toContain('Read the sources')
  expect(screen.getByRole('cell', { name: 'Count' })).toBeTruthy()
  expect(screen.getByText('Useful')).toBeTruthy()
  expect(document.querySelector('dt')?.textContent).toBe('name')
})

it('renders read-only scheduled-job instructions as Markdown', () => {
  render(<PanelBlock>{'# Morning brief\n\n- Check **sources**\n- Draft the report'}</PanelBlock>)
  expect(screen.getByRole('heading', { name: 'Morning brief' })).toBeTruthy()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})
