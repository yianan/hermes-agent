import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { type AgentPluginRow, type GatewayRequest, type PluginSkillRow, loadAgentPlugins } from '@/store/agent-plugins'
import { confirm } from '@/store/confirm'
import { SkillMarkdown } from '../skills/skill-markdown'
import { notifyError } from '@/store/notifications'

interface SkillResult {
  ok: boolean
  skill?: PluginSkillRow
  content?: string
  deleted?: boolean
}

interface PluginSkillsProps {
  plugin: AgentPluginRow
  request: GatewayRequest
  profile: string | null
}

export function PluginSkills({ plugin, request, profile }: PluginSkillsProps) {
  const { t } = useI18n()
  const copy = t.skills.plugins.skillManager
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PluginSkillRow | null>(null)
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const locked = busy || (editing && content !== original)
  const scope = `${profile ?? ''}:${plugin.key}`

  useEffect(() => {
    generation.current++
    setSelected(null)
    setEditing(false)
    setBusy(false)
    setError(null)
    return () => {
      generation.current++
    }
  }, [scope])

  async function run(skill: PluginSkillRow, operation: string, value?: string) {
    const ticket = ++generation.current
    setBusy(true)
    setError(null)
    try {
      const result = await request<SkillResult>('plugins.manage', {
        action: 'skill',
        skill: skill.qualified_name,
        operation,
        ...(profile ? { profile } : {}),
        ...(value === undefined ? {} : { content: value })
      })
      if (!result.ok) throw new Error(copy.failed)
      if (ticket !== generation.current) return
      if (operation === 'view') {
        setSelected(result.skill ?? skill)
        setContent(result.content ?? '')
        setOriginal(result.content ?? '')
        setEditing(false)
      } else {
        await loadAgentPlugins(request, profile)
        if (ticket !== generation.current) return
        if (result.deleted) {
          setSelected(null)
        } else if (selected?.qualified_name === skill.qualified_name) {
          const detail = await request<SkillResult>('plugins.manage', {
            action: 'skill',
            skill: skill.qualified_name,
            operation: 'view',
            ...(profile ? { profile } : {})
          })
          if (ticket !== generation.current) return
          setSelected(detail.skill ?? result.skill ?? skill)
          setContent(detail.content ?? '')
          setOriginal(detail.content ?? '')
          setEditing(false)
        }
      }
    } catch (err) {
      if (ticket === generation.current) {
        setError(err instanceof Error ? err.message : String(err))
        notifyError(err, copy.failed)
      }
    } finally {
      if (ticket === generation.current) setBusy(false)
    }
  }

  async function destructive(skill: PluginSkillRow, operation: 'delete' | 'reset') {
    const ticket = generation.current
    if (
      await confirm({
        title: operation === 'delete' ? copy.delete : copy.reset,
        description: operation === 'delete' ? copy.deleteConfirm : copy.resetConfirm,
        confirmLabel: operation === 'delete' ? copy.delete : copy.reset,
        destructive: true
      })
    ) {
      if (ticket === generation.current) await run(skill, operation)
    }
  }

  return (
    <div className="px-3 pb-2">
      <Button size="xs" variant="text" aria-expanded={open} onClick={() => setOpen(!open)}>
        {copy.skills} ({plugin.skills?.length ?? 0})
      </Button>
      {open && (
        <div className="space-y-2 py-2">
          <p className="text-xs text-(--ui-text-tertiary)">{copy.hint}</p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {plugin.skills?.map(skill => (
            <div className="flex flex-wrap items-center gap-2 text-xs" key={skill.qualified_name}>
              <Button size="xs" variant="text" disabled={locked} onClick={() => void run(skill, 'view')}>
                {skill.name}
              </Button>
              {skill.inactive && <span>{copy.inactive}</span>}
              {skill.disabled && <span>{copy.disabled}</span>}
              {skill.customized && <span>{copy.customized}</span>}
              <Switch
                aria-label={skill.qualified_name}
                checked={!skill.disabled}
                disabled={locked}
                onCheckedChange={enabled => void run(skill, enabled ? 'enable' : 'disable')}
              />
              <Button
                size="xs"
                variant="text"
                disabled={locked}
                onClick={() => void run(skill, skill.disabled ? 'restore' : 'remove')}
              >
                {skill.disabled ? copy.restore : copy.remove}
              </Button>
              {skill.removable && (
                <Button size="xs" variant="text" disabled={locked} onClick={() => void destructive(skill, 'delete')}>
                  {copy.delete}
                </Button>
              )}
            </div>
          ))}
          {selected && (
            <div className="space-y-2" aria-label={selected.qualified_name}>
              <p className="text-xs font-medium">{selected.qualified_name}</p>
              <div className="flex flex-wrap gap-2">
                {selected.editable && !editing && (
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                    {copy.edit}
                  </Button>
                )}
                {selected.customizable && !selected.customized && (
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => void run(selected, 'customize')}>
                    {copy.customize}
                  </Button>
                )}
                {selected.customized && (
                  <Button size="xs" variant="text" disabled={busy} onClick={() => void destructive(selected, 'reset')}>
                    {copy.reset}
                  </Button>
                )}
                {editing && (
                  <>
                    <Button
                      size="xs"
                      disabled={busy || content === original}
                      onClick={() => void run(selected, 'save', content)}
                    >
                      {copy.save}
                    </Button>
                    <Button
                      size="xs"
                      variant="text"
                      disabled={busy}
                      onClick={() => {
                        setContent(original)
                        setEditing(false)
                      }}
                    >
                      {copy.cancel}
                    </Button>
                  </>
                )}
              </div>
              {editing ? (
                <Textarea
                  aria-label={copy.content}
                  className="min-h-64 font-mono text-xs"
                  value={content}
                  disabled={busy}
                  onChange={e => setContent(e.target.value)}
                />
              ) : (
                <div className="max-h-96 overflow-auto">
                  <SkillMarkdown content={content} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
