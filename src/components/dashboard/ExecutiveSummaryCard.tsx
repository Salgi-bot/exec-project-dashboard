import type { Executive, Project, CellEdit, StatusCategory } from '@/types/project.types'
import { StatusBadge, StatusDot } from '@/components/shared/StatusBadge'
import { classifyStatus } from '@/utils/statusClassifier'
import { useAppStore } from '@/store/appStore'

interface Props {
  executive: Executive
  projects: Project[]
  editQueue: CellEdit[]
}

const titleColors: Record<string, string> = {
  '본부장': 'bg-red-100 text-red-700',
  '전무': 'bg-blue-100 text-blue-700',
  '상무': 'bg-purple-100 text-purple-700',
}

export function ExecutiveSummaryCard({ executive, projects, editQueue }: Props) {
  const setViewMode = useAppStore(s => s.setViewMode)
  const setAllExecutives = useAppStore(s => s.setAllExecutives)

  // 각 프로젝트의 현재 상태 (가장 최근 비어있지 않은 주차)
  function getLatestStatus(project: Project): { text: string; category: StatusCategory } {
    const statuses = [...project.weekStatuses].reverse()
    const found = statuses.find(ws => ws.text && ws.text !== '-' && ws.text !== '')
    if (!found) return { text: '', category: 'empty' }
    const edit = editQueue.find(e => e.projectId === project.id && e.monthIndex === found.monthIndex && e.weekIndex === found.weekIndex)
    const text = edit?.newText ?? found.text
    return { text, category: classifyStatus(text) }
  }

  // 월별 활동 현황 (12개월)
  function getMonthActivity(project: Project): StatusCategory[] {
    const result: StatusCategory[] = []
    for (let m = 0; m < 12; m++) {
      const weeks = project.weekStatuses.filter(ws => ws.monthIndex === m)
      const active = weeks.find(ws => ws.text && ws.text !== '-' && ws.text !== '')
      result.push(active ? classifyStatus(active.text) : 'empty')
    }
    return result
  }

  const handleCardClick = () => {
    setAllExecutives([executive.id])
    setViewMode('gantt')
  }

  const titleClass = titleColors[executive.title] || 'bg-gray-100 text-gray-700'

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md transition-shadow"
      onClick={handleCardClick}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-800">{executive.name}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${titleClass}`}>
            {executive.title}
          </span>
        </div>
        <span className="text-sm text-gray-500">{projects.length}건</span>
      </div>

      {/* 프로젝트 목록 */}
      <div className="space-y-2">
        {projects.slice(0, 6).map(project => {
          const { category } = getLatestStatus(project)
          const monthActivity = getMonthActivity(project)

          return (
            <div key={project.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate font-medium">{project.projectName}</p>
                {project.client && (
                  <p className="text-xs text-gray-400 truncate">{project.client}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* 12개월 dot */}
                <div className="flex gap-0.5">
                  {monthActivity.map((cat, i) => (
                    <StatusDot key={i} category={cat} />
                  ))}
                </div>
                <StatusBadge category={category} size="sm" />
              </div>
            </div>
          )
        })}
        {projects.length > 6 && (
          <p className="text-xs text-gray-400 text-center mt-1">+{projects.length - 6}건 더보기</p>
        )}
      </div>
    </div>
  )
}
