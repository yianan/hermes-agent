import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/components/chat/shiki-highlighter', () => ({
  exceedsHighlightBudget: (code: string) => code.length > 150_000,
  LazyShiki: ({
    code,
    language,
    theme
  }: {
    code: string
    language: string
    theme: { light: string; dark: string }
  }) => (
    <pre data-language={language} data-light={theme.light} data-dark={theme.dark}>
      <code>{code}</code>
    </pre>
  )
}))

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
  expect(container.querySelector('pre')?.dataset.language).toBe('python')
  expect(container.querySelector('pre')?.dataset.light).toBe('github-light-default')
  expect(container.querySelector('pre')?.dataset.dark).toBe('github-dark-default')
  expect(container.querySelector('pre pre')).toBeNull()
  expect(container.querySelector('dt')?.textContent).toBe('name')
  expect(container.querySelector('dd')?.textContent).toBe('example')
})

it('preserves inline code and unlabelled fences, and routes JSON and shell fences to their grammars', () => {
  const { container } = render(
    <SkillMarkdown
      content={'Use `x = 1`.\n\n```\nplain <text>\n```\n\n```json\n{"value": 42}\n```\n\n```bash\necho "$HOME"\n```'}
    />
  )
  const blocks = container.querySelectorAll('pre')
  expect(blocks).toHaveLength(3)
  expect(blocks[0].textContent).toBe('plain <text>\n')
  expect(blocks[0].dataset.language).toBeUndefined()
  expect(blocks[1].dataset.language).toBe('json')
  expect(blocks[1].textContent).toBe('{"value": 42}')
  expect(blocks[2].dataset.language).toBe('bash')
  expect(screen.getByText('x = 1').tagName).toBe('CODE')
})
