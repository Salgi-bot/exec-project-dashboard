import type { StatusCategory } from '@/types/project.types'
import { statusCategoryLabel } from '@/utils/statusClassifier'

const categoryClasses: Record<StatusCategory, string> = {
  active:       'bg-blue-100 text-blue-800',
  complete:     'bg-green-100 text-green-800',
  pending:      'bg-yellow-100 text-yellow-800',
  review:       'bg-purple-100 text-purple-800',
  construction: 'bg-orange-100 text-orange-800',
  inactive:     'bg-gray-100 text-gray-500',
  empty:        'bg-gray-50 text-gray-300',
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
    active: 'bg-blue-400',
    complete: 'bg-green-400',
    pending: 'bg-yellow-400',
    review: 'bg-purple-400',
    construction: 'bg-orange-400',
    inactive: 'bg-gray-300',
    empty: 'bg-gray-100',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${dotColors[category]}`} />
}

export function statusCellClass(category: StatusCategory): string {
  return `status-${category}`
}
