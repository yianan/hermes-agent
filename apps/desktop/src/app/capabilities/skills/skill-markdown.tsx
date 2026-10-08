import { useMemo } from 'react'

import { CompactMarkdown } from '@/components/chat/compact-markdown'

import { parseFrontmatter } from './frontmatter'

/** Display metadata separately; retain the complete source for the editor. */
export function SkillMarkdown({ content }: { content: string }) {
  const parsed = useMemo(() => parseFrontmatter(content), [content])

  return (
    <div className="space-y-3" data-selectable-text="true">
      {parsed.meta.length > 0 && (
        <dl className="grid gap-1 text-xs text-(--ui-text-secondary)">
          {parsed.meta.map(([key, value]) => (
            <div className="flex gap-2" key={key}>
              <dt className="w-24 shrink-0 font-medium text-(--ui-text-tertiary)">{key}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <CompactMarkdown text={parsed.body} />
    </div>
  )
}
