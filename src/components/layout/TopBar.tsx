import { FileImportButton } from '@/components/shared/FileImportButton'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { useAppStore } from '@/store/appStore'
import { useActiveSheet } from '@/hooks/useFilteredProjects'

export function TopBar() {
  const selectedExecutiveIds = useAppStore(s => s.selectedExecutiveIds)
  const toggleExecutive = useAppStore(s => s.toggleExecutive)
  const setAllExecutives = useAppStore(s => s.setAllExecutives)
  const searchText = useAppStore(s => s.searchText)
  const setSearchText = useAppStore(s => s.setSearchText)
  const hideEmpty = useAppStore(s => s.hideEmpty)
  const setHideEmpty = useAppStore(s => s.setHideEmpty)
  const hideSameTaskMonths = useAppStore(s => s.hideSameTaskMonths)
  const setHideSameTaskMonths = useAppStore(s => s.setHideSameTaskMonths)
  const sheet = useActiveSheet()

  const availableExecs = sheet?.executives || []

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap no-print">
      <PeriodSelector />

      <div className="flex items-center gap-2 ml-auto">
        {/* 임원 필터 */}
        {availableExecs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-500">임원:</span>
            <button
              onClick={() => setAllExecutives([])}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedExecutiveIds.length === 0
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            {availableExecs.map(exec => (
              <button
                key={exec.id}
                onClick={() => toggleExecutive(exec.id)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  selectedExecutiveIds.includes(exec.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {exec.name}
              </button>
            ))}
          </div>
        )}

        {/* 빈 항목 숨기기 */}
        <button
          onClick={() => setHideEmpty(!hideEmpty)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
            hideEmpty
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title="내용 없음 또는 '-'만 있는 항목 숨기기"
        >
          빈 항목 숨기기
        </button>

        {/* 장기 동일 업무 숨기기 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 whitespace-nowrap">동일업무:</span>
          {([0, 3, 6, 12] as const).map(n => (
            <button
              key={n}
              onClick={() => setHideSameTaskMonths(n === hideSameTaskMonths ? 0 : n)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                hideSameTaskMonths === n && n > 0
                  ? 'bg-purple-500 text-white'
                  : n === 0
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={n === 0 ? '필터 해제' : `${n}개월 이상 동일 업무 숨기기`}
            >
              {n === 0 ? '전체' : `${n}개월+`}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <input
          type="text"
          placeholder="프로젝트 검색..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <FileImportButton />
      </div>
    </div>
  )
}
