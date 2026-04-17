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
  { id: '이원규', name: '이원규', title: '전무', order: 8 },
  { id: '백창희', name: '백창희', title: '전무', order: 9 },
]

export const EXECUTIVE_MAP: Record<string, Executive> = Object.fromEntries(
  EXECUTIVES.map(e => [e.id, e])
)

export const EXECUTIVE_COLORS: Record<string, { bg: string; header: string; text: string }> = {
  '이동석': { bg: '#eff6ff', header: '#1d4ed8', text: '#1e40af' },
  '고영학': { bg: '#f0fdf4', header: '#15803d', text: '#166534' },
  '황현하': { bg: '#faf5ff', header: '#7e22ce', text: '#6b21a8' },
  '김준':   { bg: '#fff7ed', header: '#c2410c', text: '#9a3412' },
  '김명직': { bg: '#ecfeff', header: '#0e7490', text: '#0e7490' },
  '최보령': { bg: '#fdf2f8', header: '#be185d', text: '#9d174d' },
  '오선미': { bg: '#fefce8', header: '#854d0e', text: '#713f12' },
  '김대영': { bg: '#ecfdf5', header: '#065f46', text: '#064e3b' },
  '이원규': { bg: '#f5f3ff', header: '#5b21b6', text: '#4c1d95' },
  '백창희': { bg: '#fff1f2', header: '#be123c', text: '#9f1239' },
}

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
