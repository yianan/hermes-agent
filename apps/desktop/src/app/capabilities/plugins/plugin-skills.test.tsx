import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { type AgentPluginRow, type GatewayRequest, type PluginSkillRow } from '@/store/agent-plugins'
import { PluginSkills } from './plugin-skills'

const skill: PluginSkillRow = {
  name: 'sample',
  qualified_name: 'demo:sample',
  description: '',
  editable: true,
  customizable: false,
  customized: false,
  disabled: false,
  inactive: false,
  removable: true
}
const plugin: AgentPluginRow = {
  name: 'demo',
  key: 'demo',
  version: '1',
  description: '',
  source: 'user',
  status: 'enabled',
  skills: [skill]
}
afterEach(cleanup)

it('views and saves through the scoped plugin RPC and retains the draft on failure', async () => {
  let stored = 'original'
  let fail = true
  const rpc = vi.fn(async (_method: string, params?: Record<string, unknown>) => {
    if (params?.action === 'list') return { plugins: [plugin] }
    if (params?.operation === 'save') {
      if (fail) throw new Error('write refused')
      stored = String(params.content)
    }
    return { ok: true, skill, content: stored }
  })
  render(<PluginSkills plugin={plugin} profile="research" request={rpc as GatewayRequest} />)
  fireEvent.click(screen.getByRole('button', { name: /Plugin skills/ }))
  fireEvent.click(screen.getByRole('button', { name: 'sample' }))
  await screen.findByText('original')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByLabelText('Skill content'), { target: { value: 'changed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('Skill content') as HTMLTextAreaElement).value).toBe('changed')
  fail = false
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByLabelText('Skill content')).toBeNull())
  expect(stored).toBe('changed')
  expect(rpc).toHaveBeenCalledWith(
    'plugins.manage',
    expect.objectContaining({ profile: 'research', operation: 'save', skill: 'demo:sample', content: 'changed' })
  )
})

it('ignores a late skill detail after changing profile', async () => {
  let finish: (value: unknown) => void = () => undefined
  const rpc = vi.fn(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const { rerender } = render(<PluginSkills plugin={plugin} profile="a" request={rpc as GatewayRequest} />)
  fireEvent.click(screen.getByRole('button', { name: /Plugin skills/ }))
  fireEvent.click(screen.getByRole('button', { name: 'sample' }))
  rerender(<PluginSkills plugin={plugin} profile="b" request={rpc as GatewayRequest} />)
  finish({ ok: true, skill, content: 'private A content' })
  await waitFor(() => expect(screen.queryByText('private A content')).toBeNull())
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
})
