import { FileImportButton } from '@/components/shared/FileImportButton'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { useAppStore } from '@/store/appStore'
import { useActiveSheet } from '@/hooks/useFilteredProjects'

import type { SyncStatus } from '@/lib/cloudSync'

interface Props {
  onMenuClick: () => void
  syncStatus: SyncStatus
  lastSynced?: Date
}

export function TopBar({ onMenuClick, syncStatus, lastSynced }: Props) {
  const syncDot = syncStatus === 'error' ? '#ef4444' : syncStatus === 'saving' ? '#f59e0b' : '#22c55e'
  const syncTip = syncStatus === 'saving' ? '저장 중...' : syncStatus === 'error' ? '동기화 실패' : lastSynced ? `${lastSynced.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 동기화됨` : '동기화 대기'
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
    <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-2 flex flex-col gap-1.5 no-print">
      {/* 1행: 파일변경 + 연도 + 동기화 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded hover:bg-gray-100"
          aria-label="메뉴 열기"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <FileImportButton />
        <PeriodSelector />
        <span title={syncTip} className="ml-auto" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: syncDot, flexShrink: 0 }} />
      </div>

      {/* 2행: 임원 필터 + 검색 (파일변경과 동일 좌측 기준) */}
      <div className="flex items-center gap-1.5 flex-wrap">
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
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={selectedExecutiveIds.includes(exec.id) ? { backgroundColor: 'var(--ci-blue)' } : undefined}
              >
                {exec.name}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setHideEmpty(!hideEmpty)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
            hideEmpty ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title="내용 없음 또는 '-'만 있는 항목 숨기기"
        >
          빈 항목 숨김
        </button>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 whitespace-nowrap">동일업무:</span>
          {([0, 3, 6, 12] as const).map(n => (
            <button
              key={n}
              onClick={() => setHideSameTaskMonths(n === hideSameTaskMonths ? 0 : n)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                hideSameTaskMonths === n && n > 0
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={n === 0 ? '필터 해제' : `${n}개월 이상 동일 업무 숨기기`}
            >
              {n === 0 ? '전체' : `${n}개월+`}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="검색..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-32 md:w-48 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
    </div>
  )
}
