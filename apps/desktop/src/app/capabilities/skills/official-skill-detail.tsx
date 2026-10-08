import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { CountSkeleton } from '@/components/ui/skeleton'
import { previewSkillHub, type ProfileScope, profileScopeKey } from '@/hermes'
import { useI18n } from '@/i18n'
import { Loader2 } from '@/lib/icons'
import type { OfficialSkillInfo } from '@/types/hermes'

import { PanelPill } from '../../overlays/panel'
import { asText, prettyName } from '../../settings/helpers'
import { DetailHeader } from '../primitives'

import { SkillMarkdown } from './skill-markdown'

// Detail pane for a not-yet-installed catalog skill.
export function OfficialSkillDetail({
  installing,
  onInstall,
  profile,
  skill
}: {
  installing: boolean
  onInstall: () => void
  profile?: ProfileScope
  skill: OfficialSkillInfo
}) {
  const { t } = useI18n()

  const previewQuery = useQuery({
    queryKey: ['official-skill-preview', skill.identifier, profileScopeKey(profile)],
    queryFn: () => previewSkillHub(skill.identifier, profile),
    staleTime: 5 * 60_000,
    retry: false
  })

  return (
    <>
      <DetailHeader
        description={asText(skill.description) || t.skills.noDescription}
        pills={
          <>
            <PanelPill>{prettyName(skill.category)}</PanelPill>
            <PanelPill tone="muted">{t.skills.officialPill}</PanelPill>
          </>
        }
        title={skill.name}
      />
      <div className="flex items-center gap-2">
        <Button disabled={installing} onClick={onInstall} size="xs" variant="textStrong">
          {installing && <Loader2 className="size-3 animate-spin" />}
          {installing ? t.skills.hub.installing : t.skills.hub.install}
        </Button>
      </div>
      {previewQuery.isLoading ? (
        <CountSkeleton />
      ) : previewQuery.data?.skill_md ? (
        <SkillMarkdown content={previewQuery.data.skill_md} />
      ) : null}
    </>
  )
}
