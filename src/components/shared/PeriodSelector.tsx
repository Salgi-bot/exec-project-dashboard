import { useAppStore } from '@/store/appStore'
import type { DisplayYear, SheetId } from '@/types/project.types'
import { YEAR_SHEET_PRIORITY } from '@/types/project.types'

// 연도별 표시 라벨
const YEAR_LABELS: Record<DisplayYear, string> = {
  '2024':   '2024',
  '2024-3': '2024-3',
  '2025':   '2025',
  '2026':   '2026',
}

const DISPLAY_YEARS: DisplayYear[] = ['2024', '2024-3', '2025', '2026']

export function PeriodSelector() {
  const sheets = useAppStore(s => s.sheets)
  const activeSheetId = useAppStore(s => s.activeSheetId)
  const setActiveSheet = useAppStore(s => s.setActiveSheet)

  // 각 연도 그룹에서 실제 사용할 시트 ID 결정 (우선순위대로 첫 번째 존재하는 것)
  function getSheetForYear(year: DisplayYear): SheetId | null {
    for (const sid of YEAR_SHEET_PRIORITY[year]) {
      if (sheets[sid]) return sid
    }
    return null
  }

  // 현재 activeSheetId가 속한 연도 그룹
  function getActiveYear(): DisplayYear | null {
    for (const year of DISPLAY_YEARS) {
      if (YEAR_SHEET_PRIORITY[year].includes(activeSheetId)) return year
    }
    return null
  }

  const activeYear = getActiveYear()
  const availableYears = DISPLAY_YEARS.filter(y => getSheetForYear(y) !== null)

  if (availableYears.length === 0) return null

  return (
    <div className="flex gap-1 flex-wrap items-center">
      <span className="text-xs text-gray-400 mr-1">연도:</span>
      {availableYears.map(year => {
        const sheetId = getSheetForYear(year)!
        const period = sheets[sheetId]?.period
        return (
          <button
            key={year}
            onClick={() => setActiveSheet(sheetId)}
            title={period?.label}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeYear === year
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {YEAR_LABELS[year]}년
          </button>
        )
      })}
    </div>
  )
}
