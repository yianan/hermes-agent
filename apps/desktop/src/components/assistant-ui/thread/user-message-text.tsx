import type { ComponentProps, FC } from 'react'
import { useMemo } from 'react'

import { DirectiveContent } from '@/components/assistant-ui/directive-text'
import { referenceRe } from '@/components/assistant-ui/reference-kinds'
import { CompactMarkdown } from '@/components/chat/compact-markdown'
import { ExternalLink } from '@/lib/external-link'
import { cn } from '@/lib/utils'
import { useForcedTextDirection } from '@/store/text-direction'

// Protect composer references before Markdown consumes their quoted values.
// Fenced code remains literal; decoded references use the existing chip renderer.
const REFERENCE_PREFIX = '#hermes-reference:'
function protectReferences(text: string): string {
  const protect = (part: string) =>
    part.replace(referenceRe(), match => `[reference](${REFERENCE_PREFIX}${encodeURIComponent(match)})`)
  const fences = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*(?:\n|$)/gm
  const parts: string[] = []
  let cursor = 0
  for (const match of text.matchAll(fences)) {
    parts.push(protect(text.slice(cursor, match.index)), match[0])
    cursor = match.index + match[0].length
  }
  parts.push(protect(text.slice(cursor)))
  return parts.join('')
}

function UserAnchor({ children, href, ...rest }: ComponentProps<'a'>) {
  if (href?.startsWith(REFERENCE_PREFIX)) {
    try {
      return <DirectiveContent text={decodeURIComponent(href.slice(REFERENCE_PREFIX.length))} />
    } catch {
      return <span>{children}</span>
    }
  }
  if (href && /^https?:\/\//i.test(href)) return <ExternalLink href={href}>{children}</ExternalLink>
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}

function UserCode(props: ComponentProps<'code'>) {
  return (
    <code
      {...props}
      className="rounded bg-muted/80 px-1 py-px font-mono text-[0.92em]"
      data-slot="aui_user-inline-code"
    />
  )
}
const COMPONENTS = { a: UserAnchor, code: UserCode }

export const UserMessageText: FC<{ className?: string; text: string }> = ({ className, text }) => {
  const markdown = useMemo(() => protectReferences(text), [text])
  const textDirection = useForcedTextDirection()
  return (
    <div className={cn('wrap-anywhere', className)} data-slot="aui_user-inline-text" dir={textDirection}>
      <CompactMarkdown
        className="text-[length:inherit] leading-[inherit] text-[color:inherit]"
        components={COMPONENTS}
        highlightCode={false}
        text={markdown}
      />
    </div>
  )
}
