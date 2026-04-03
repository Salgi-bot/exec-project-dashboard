import type { StatusCategory } from '@/types/project.types'

const COMPLETE_KEYWORDS = ['완료', '납품', '준공', '사용승인', '인가완료', '승인완료', '허가완료', '착공완료']
const CONSTRUCTION_KEYWORDS = ['공사중', '공사진행', '착공', '공사']
const PENDING_KEYWORDS = ['예정', '준비', '계획', '접수예정']
const REVIEW_KEYWORDS = ['협의', '검토', '심의', '자문', '회의']

export function classifyStatus(text: string): StatusCategory {
  if (!text || text.trim() === '') return 'empty'
  if (text.trim() === '-') return 'inactive'

  const t = text

  for (const kw of COMPLETE_KEYWORDS) {
    if (t.includes(kw)) return 'complete'
  }
  for (const kw of CONSTRUCTION_KEYWORDS) {
    if (t.includes(kw)) return 'construction'
  }
  for (const kw of PENDING_KEYWORDS) {
    if (t.includes(kw)) return 'pending'
  }
  for (const kw of REVIEW_KEYWORDS) {
    if (t.includes(kw)) return 'review'
  }

  return 'active'
}

export function statusCategoryLabel(cat: StatusCategory): string {
  switch (cat) {
    case 'complete': return '완료'
    case 'construction': return '공사중'
    case 'pending': return '예정'
    case 'review': return '협의/검토'
    case 'active': return '진행중'
    case 'inactive': return '해당없음'
    case 'empty': return '미기재'
  }
}
