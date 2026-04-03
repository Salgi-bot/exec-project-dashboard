import type { Executive } from '@/types/project.types'

export const EXECUTIVES: Executive[] = [
  { id: '이동석', name: '이동석', title: '본부장', order: 0 },
  { id: '고영학', name: '고영학', title: '전무', order: 1 },
  { id: '황현하', name: '황현하', title: '전무', order: 2 },
  { id: '김준', name: '김준', title: '전무', order: 3 },
  { id: '김명직', name: '김명직', title: '전무', order: 4 },
  { id: '최보령', name: '최보령', title: '전무', order: 5 },
  { id: '오선미', name: '오선미', title: '상무', order: 6 },
  { id: '김대영', name: '김대영', title: '전무', order: 7 },
  { id: '이원규', name: '이원규', title: '상무', order: 8 },
  { id: '백창희', name: '백창희', title: '상무', order: 9 },
]

export const EXECUTIVE_MAP: Record<string, Executive> = Object.fromEntries(
  EXECUTIVES.map(e => [e.id, e])
)

// 임원 이름 정규화: "김    준\n전    무" → "김준"
export function normalizeExecutiveName(raw: string): string {
  if (!raw) return ''
  // 줄바꿈 기준으로 첫 번째 줄이 이름
  const lines = raw.split('\n')
  const name = lines[0].replace(/\s+/g, '').trim()
  return name
}

export function normalizeExecutiveTitle(raw: string): string {
  if (!raw) return ''
  const lines = raw.split('\n')
  if (lines.length < 2) return ''
  return lines[1].replace(/\s+/g, '').trim()
}

export function findExecutive(rawCell: string): Executive | null {
  const name = normalizeExecutiveName(rawCell)
  return EXECUTIVE_MAP[name] || null
}
