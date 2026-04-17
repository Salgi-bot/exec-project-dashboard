import { useAppStore } from '@/store/appStore'
import { useActiveSheet, useFilteredProjects } from '@/hooks/useFilteredProjects'
import { EmptyState } from '@/components/shared/EmptyState'
import { ExecutiveSummaryCard } from './ExecutiveSummaryCard'

export function DashboardView() {
  const sheet = useActiveSheet()
  const editQueue = useAppStore(s => s.editQueue)
  const filteredProjects = useFilteredProjects()

  if (!sheet) return (
    <div className="p-8">
      <EmptyState />
    </div>
  )

  const { executives, period } = sheet

  // 통계 (필터 적용된 프로젝트 기준)
  const displayProjects = filteredProjects.filter(p => !p.isManagerSummaryRow)
  const activeCount = displayProjects.filter(p =>
    p.weekStatuses.some(ws => ws.text && ws.text !== '-')
  ).length

  // 카드에 표시할 임원 목록 (필터 결과에 등장하는 임원만)
  const visibleExecIds = new Set(filteredProjects.map(p => p.executiveId))
  const visibleExecutives = executives.filter(e => visibleExecIds.has(e.id))

  return (
    <div className="p-6">
      {/* 헤더 + 인라인 통계 */}
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">■ 대시보드</h2>
          <p className="text-gray-500 text-sm mt-1">{period.label}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <span className="text-gray-500">총 <b className="text-gray-800 text-lg">{displayProjects.length}</b>건</span>
          <span className="text-gray-500">진행중 <b className="text-blue-600 text-lg">{activeCount}</b>건</span>
        </div>
      </div>

      {/* 임원별 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleExecutives.map(exec => {
          const execProjects = filteredProjects.filter(p => p.executiveId === exec.id && !p.isManagerSummaryRow)
          return (
            <ExecutiveSummaryCard
              key={exec.id}
              executive={exec}
              projects={execProjects}
              editQueue={editQueue.filter(e => execProjects.some(p => p.id === e.projectId))}
            />
          )
        })}
      </div>
    </div>
  )
}
