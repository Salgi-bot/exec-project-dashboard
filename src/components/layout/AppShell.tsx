import { useEffect, useState, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '@/store/appStore'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { GanttView } from '@/components/gantt/GanttView'
import { ProjectListView } from '@/components/projects/ProjectListView'
import { ReportView } from '@/components/report/ReportView'
import { initCloudSync, onSyncStatusChange, forceSave, loadFromCloud, type SyncStatus } from '@/lib/cloudSync'

export function AppShell() {
  const viewMode = useAppStore(s => s.viewMode)
  const [synced, setSynced] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSynced, setLastSynced] = useState<Date | undefined>()

  useEffect(() => {
    onSyncStatusChange((s, at) => {
      setSyncStatus(s)
      if (at) setLastSynced(at)
    })
    initCloudSync().finally(() => setSynced(true))
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
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--ci-blue)', borderTopColor: 'transparent' }} />
          <p className="text-gray-500 text-sm">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  const syncLabel = syncStatus === 'saving' ? '동기화 중...'
    : syncStatus === 'error' ? '동기화 실패'
    : lastSynced ? `동기화 ${lastSynced.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '동기화'

  const syncColor = syncStatus === 'error' ? '#ef4444' : syncStatus === 'saved' ? '#22c55e' : '#6b7280'

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} onSync={handleSync} syncLabel={syncLabel} syncColor={syncColor} syncBusy={syncStatus === 'saving'} />
        <main className="flex-1 overflow-auto bg-gray-50">
          {viewMode === 'dashboard' && <DashboardView />}
          {viewMode === 'gantt' && <GanttView />}
          {viewMode === 'projects' && <ProjectListView />}
          {viewMode === 'report' && <ReportView />}
        </main>
      </div>
    </div>
  )
}
