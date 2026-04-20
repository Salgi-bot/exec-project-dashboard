import { FileImportButton } from '@/components/shared/FileImportButton'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { useAppStore } from '@/store/appStore'
import { useActiveSheet, useFilteredProjects } from '@/hooks/useFilteredProjects'
import { exportToExcel } from '@/utils/excelExport'

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
  const projects = useFilteredProjects()
  const assigneeOverrides = useAppStore(s => s.assigneeOverrides)

  const availableExecs = sheet?.executives || []

  function handleExcelExport() {
    if (!sheet) return
    exportToExcel(projects, sheet, assigneeOverrides, `임원회의_진행일정표_${sheet.sheetId}.xlsx`)
  }

  return (
    <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 flex items-center gap-2 md:gap-4 flex-wrap no-print">
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

      <div className="flex items-center gap-1.5 md:gap-2 ml-auto flex-wrap justify-end">
        {/* 임원 필터 */}
        {availableExecs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-500 hidden sm:inline">임원:</span>
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
            hideEmpty
              ? 'bg-gray-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title="내용 없음 또는 '-'만 있는 항목 숨기기"
        >
          빈 항목 숨김
        </button>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">동일업무:</span>
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

        <span title={syncTip} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: syncDot, flexShrink: 0 }} />
        {sheet && (
          <button
            onClick={handleExcelExport}
            className="px-3 py-1.5 text-white rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
            style={{ backgroundColor: 'var(--ci-green)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--ci-green-dark)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-green)' }}
            title="현재 데이터를 Excel로 다운로드"
          >
            Excel
          </button>
        )}
      </div>
    </div>
  )
}
