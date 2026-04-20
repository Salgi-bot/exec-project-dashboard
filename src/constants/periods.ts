import type { SheetPeriod } from '@/types/project.types'

export interface MonthLabel {
  label: string      // '07월'
  year: number       // 2025
  yearShort: string  // '25년'
}

// SheetPeriod 기반으로 월 라벨 생성 (Excel 헤더에서 파싱된 실제 값 사용)
export function getMonthLabels(period: SheetPeriod): MonthLabel[] {
  const labels: MonthLabel[] = []
  let year = period.startYear
  let month = period.startMonth
  for (let i = 0; i < period.totalMonths; i++) {
    labels.push({
      label: `${String(month).padStart(2, '0')}월`,
      year,
      yearShort: `${year}년`,
    })
    month++
    if (month > 12) { month = 1; year++ }
  }
  return labels
}

// SheetPeriod에서 표시용 라벨 생성
export function buildPeriodLabel(period: SheetPeriod): string {
  const endInfo = getMonthLabels(period).at(-1)
  if (!endInfo) return ''
  return `${period.startYear}.${String(period.startMonth).padStart(2,'0')} ~ ${endInfo.year}.${endInfo.label.replace('월','')}`
}
