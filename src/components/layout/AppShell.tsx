import { useEffect, useState, useCallback, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '@/store/appStore'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { GanttView } from '@/components/gantt/GanttView'
import { ProjectListView } from '@/components/projects/ProjectListView'
import { ReportView } from '@/components/report/ReportView'
import {
  initCloudSync, startPolling, onSyncStatusChange,
  onConflictDetected, onRemoteUpdated,
  forceSave, loadFromCloud, type SyncStatus,
} from '@/lib/cloudSync'

interface ConflictHandlers { keepMine: () => void; useTheirs: () => void }

export function AppShell() {
  const viewMode = useAppStore(s => s.viewMode)
  const [synced, setSynced]           = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [syncStatus, setSyncStatus]   = useState<SyncStatus>('idle')
  const [lastSynced, setLastSynced]   = useState<Date | undefined>()
  const [conflict, setConflict]       = useState<ConflictHandlers | null>(null)
  const [remoteToast, setRemoteToast] = useState(false)
  const toastTimer                    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    onSyncStatusChange((s, at) => {
      setSyncStatus(s)
      if (at) setLastSynced(at)
    })

    onConflictDetected((keepMine, useTheirs) => {
      setConflict({
        keepMine: () => { keepMine(); setConflict(null) },
        useTheirs: () => { useTheirs(); setConflict(null) },
      })
    })

    onRemoteUpdated(() => {
      setRemoteToast(true)
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setRemoteToast(false), 3000)
    })

    initCloudSync().finally(() => setSynced(true))
    const stopPolling = startPolling()
    return () => { stopPolling(); clearTimeout(toastTimer.current) }
  }, [])

  const handleSync = useCallback(async () => {
    setSyncStatus('saving')
    await loadFromCloud()
    await forceSave()
  }, [])

  if (!synced) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--ci-blue)', borderTopColor: 'transparent' }} />
          <p className="text-gray-500 text-sm">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  const syncLabel = syncStatus === 'saving' ? '동기화 중...'
    : syncStatus === 'error'  ? '동기화 실패'
    : lastSynced ? `동기화 ${lastSynced.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '동기화'
  const syncColor = syncStatus === 'error' ? '#ef4444' : syncStatus === 'saved' ? '#22c55e' : '#6b7280'

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar
          onMenuClick={() => setSidebarOpen(true)}
          onSync={handleSync}
          syncLabel={syncLabel}
          syncColor={syncColor}
          syncBusy={syncStatus === 'saving'}
        />
        <main className="flex-1 overflow-auto bg-gray-50">
          {viewMode === 'dashboard' && <DashboardView />}
          {viewMode === 'gantt'     && <GanttView />}
          {viewMode === 'projects'  && <ProjectListView />}
          {viewMode === 'report'    && <ReportView />}
        </main>
      </div>

      {/* 원격 업데이트 토스트 */}
      {remoteToast && (
        <div className="fixed bottom-6 right-6 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
          다른 사용자가 업데이트했습니다. 자동 반영되었습니다.
        </div>
      )}

      {/* 충돌 모달 */}
      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-bold text-lg mb-1 text-gray-800">동기화 충돌 감지</h3>
            <p className="text-gray-500 text-sm mb-5">
              내가 수정하는 동안 다른 사용자가 데이터를 저장했습니다.<br />
              어떻게 처리할까요?
            </p>
            <div className="flex gap-2">
              <button
                onClick={conflict.keepMine}
                className="flex-1 px-3 py-2 text-white rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--ci-blue)' }}
              >
                내 변경사항 유지
              </button>
              <button
                onClick={conflict.useTheirs}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                최신 데이터 불러오기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
