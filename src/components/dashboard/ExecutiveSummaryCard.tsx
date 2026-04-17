import type { Executive, Project, CellEdit, StatusCategory } from '@/types/project.types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { classifyStatus } from '@/utils/statusClassifier'
import { useAppStore } from '@/store/appStore'

interface Props {
  executive: Executive
  projects: Project[]
  editQueue: CellEdit[]
}

export function ExecutiveSummaryCard({ executive, projects, editQueue }: Props) {
  const setViewMode = useAppStore(s => s.setViewMode)
  const setAllExecutives = useAppStore(s => s.setAllExecutives)

  function getLatestStatus(project: Project): { text: string; category: StatusCategory } {
    const statuses = [...project.weekStatuses].reverse()
    const found = statuses.find(ws => ws.text && ws.text !== '-' && ws.text !== '')
    if (!found) return { text: '', category: 'empty' }
    const edit = editQueue.find(e => e.projectId === project.id && e.monthIndex === found.monthIndex && e.weekIndex === found.weekIndex)
    const text = edit?.newText ?? found.text
    return { text, category: classifyStatus(text) }
  }

  const handleCardClick = () => {
    setAllExecutives([executive.id])
    setViewMode('gantt')
  }

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-gray-400 transition-colors"
      onClick={handleCardClick}
    >
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-100">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-gray-800">{executive.name}</span>
          <span className="text-xs text-gray-500">{executive.title}</span>
        </div>
        <span className="text-sm text-gray-500">{projects.length}건</span>
      </div>

      <div className="space-y-1.5">
        {projects.slice(0, 6).map(project => {
          const { category } = getLatestStatus(project)
          return (
            <div key={project.id} className="flex items-center gap-2">
              <p className="flex-1 text-sm text-gray-700 truncate" title={project.client ? `${project.projectName} · ${project.client}` : project.projectName}>
                {project.projectName}
              </p>
              <StatusBadge category={category} size="sm" />
            </div>
          )
        })}
        {projects.length > 6 && (
          <p className="text-xs text-gray-400 text-center pt-1">+{projects.length - 6}건</p>
        )}
      </div>
    </div>
  )
}
