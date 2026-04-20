import { useEffect, useState, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '@/store/appStore'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { GanttView } from '@/components/gantt/GanttView'
import { ProjectListView } from '@/components/projects/ProjectListView'
import { ReportView } from '@/components/report/ReportView'
import {
  initCloudSync, startPolling, onSyncStatusChange, onRemoteUpdated, type SyncStatus,
} from '@/lib/cloudSync'

export function AppShell() {
  const viewMode = useAppStore(s => s.viewMode)
  const [synced, setSynced]           = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [syncStatus, setSyncStatus]   = useState<SyncStatus>('idle')
  const [lastSynced, setLastSynced]   = useState<Date | undefined>()
  const [remoteToast, setRemoteToast] = useState(false)
  const toastTimer                    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    onSyncStatusChange((s, at) => {
      setSyncStatus(s)
      if (at) setLastSynced(at)
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

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} syncStatus={syncStatus} lastSynced={lastSynced} />
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

    </div>
  )
}
