// 내부 시트 ID (Excel 시트명과 동일)
export type SheetId = '2024-1' | '2024-2' | '2024-3' | '2025' | '2025-2' | '2026' | '2026-1'
export const SHEET_IDS: SheetId[] = ['2024-1', '2024-2', '2024-3', '2025', '2025-2', '2026', '2026-1']

// 탭 표시용 그룹: "-1"/"-2" 제거하여 연도만 표시
export type DisplayYear = '2024' | '2024-3' | '2025' | '2026'

// 각 연도에서 우선 사용할 시트 (12개월 풀버전 우선)
export const YEAR_SHEET_PRIORITY: Record<DisplayYear, SheetId[]> = {
  '2024':   ['2024-1', '2024-2'],  // 2024-1 우선
  '2024-3': ['2024-3'],
  '2025':   ['2025', '2025-2'],    // 2025 우선
  '2026':   ['2026', '2026-1'],    // 2026 우선
}

export interface SheetPeriod {
  sheetId: SheetId
  label: string
  startYear: number
  startMonth: number  // 1-based
  totalMonths: number // 실제 월 수 (Excel 헤더에서 파싱)
}

export interface Executive {
  id: string
  name: string
  title: string
  order: number
}

export type StatusCategory =
  | 'active'
  | 'complete'
  | 'pending'
  | 'review'
  | 'construction'
  | 'inactive'
  | 'empty'

export interface WeekStatus {
  monthIndex: number
  weekIndex: number
  text: string
  colSpan: number
  category: StatusCategory
}

export interface Project {
  id: string
  sheetId: SheetId
  executiveId: string
  name: string
  projectName: string
  client: string
  rowIndex: number
  weekStatuses: WeekStatus[]
  isManagerSummaryRow: boolean
}

export interface SheetData {
  sheetId: SheetId
  period: SheetPeriod
  executives: Executive[]
  projects: Project[]
}

export interface CellEdit {
  projectId: string
  monthIndex: number
  weekIndex: number
  newText: string
  timestamp: number
}

