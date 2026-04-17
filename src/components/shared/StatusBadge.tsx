import type { StatusCategory } from '@/types/project.types'
import { statusCategoryLabel } from '@/utils/statusClassifier'

const categoryClasses: Record<StatusCategory, string> = {
  active:       'status-active',
  complete:     'status-complete',
  pending:      'status-pending',
  review:       'status-review',
  construction: 'status-construction',
  inactive:     'status-inactive',
  empty:        'status-empty',
}

interface Props {
  category: StatusCategory
  size?: 'sm' | 'md'
}

export function StatusBadge({ category, size = 'sm' }: Props) {
  const cls = categoryClasses[category]
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
  return (
    <span className={`inline-block rounded font-medium ${padding} ${cls}`}>
      {statusCategoryLabel(category)}
    </span>
  )
}

export function StatusDot({ category }: { category: StatusCategory }) {
  const dotColors: Record<StatusCategory, string> = {
    active: 'bg-[color:var(--ci-blue)]',
    complete: 'bg-[color:var(--ci-green)]',
    pending: 'bg-gray-400',
    review: 'bg-gray-400',
    construction: 'bg-gray-400',
    inactive: 'bg-gray-300',
    empty: 'bg-gray-100',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${dotColors[category]}`} />
}

