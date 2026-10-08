import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { SkillMarkdown } from './skill-markdown'

afterEach(cleanup)

it('renders skill headings, lists, tables and code while separating frontmatter', () => {
  const { container } = render(
    <SkillMarkdown
      content={
        '---\nname: example\n---\n# Workflow\n\n**Review** the `inputs`.\n\n- Check sources\n\n| Item | Value |\n| --- | --- |\n| Revenue | 42 |\n\n```python\nprint("done")\n```'
      }
    />
  )
  expect(screen.getByRole('heading', { name: 'Workflow', level: 1 })).toBeTruthy()
  expect(screen.getByText('Review')).toBeTruthy()
  expect(screen.getByRole('listitem').textContent).toContain('Check sources')
  expect(screen.getByRole('cell', { name: 'Revenue' })).toBeTruthy()
  expect(container.querySelector('pre')?.textContent).toContain('print("done")')
  expect(container.querySelector('dt')?.textContent).toBe('name')
  expect(container.querySelector('dd')?.textContent).toBe('example')
})
