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

function isInInput(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function AppShell() {
  const viewMode = useAppStore(s => s.viewMode)
  const undo     = useAppStore(s => s.undo)
  const [synced, setSynced]           = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hideUI, setHideUI]           = useState(false)
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z → Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (isInInput(e.target)) return
        e.preventDefault()
        undo()
        return
      }
      // 백틱 → UI 토글
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isInInput(e.target)) return
        e.preventDefault()
        setHideUI(v => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo])

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
      <div className={hideUI ? 'hidden' : ''}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="app-main flex-1 flex flex-col overflow-hidden min-w-0">
        <div className={hideUI ? 'hidden' : ''}>
          <TopBar onMenuClick={() => setSidebarOpen(true)} syncStatus={syncStatus} lastSynced={lastSynced} />
        </div>
        <main className="flex-1 overflow-auto bg-gray-50">
          {viewMode === 'dashboard' && <DashboardView />}
          {viewMode === 'gantt'     && <GanttView />}
          {viewMode === 'projects'  && <ProjectListView />}
          {viewMode === 'report'    && <ReportView />}
        </main>
      </div>

      {/* UI 토글 버튼 (우하단 고정, 인쇄 시 숨김) */}
      <button
        onClick={() => setHideUI(v => !v)}
        title={hideUI ? 'UI 표시 (`)' : 'UI 숨기기 (`)'}
        className={`no-print fixed bottom-5 right-5 z-50 w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all ${
          hideUI
            ? 'bg-blue-600 text-white'
            : 'bg-white/70 text-gray-500 hover:bg-white hover:text-gray-700'
        }`}
        style={hideUI ? { backgroundColor: 'var(--ci-blue)' } : undefined}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          {hideUI ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>

      {/* 원격 업데이트 토스트 */}
      {remoteToast && (
        <div className="fixed bottom-6 right-6 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
          다른 사용자가 업데이트했습니다. 자동 반영되었습니다.
        </div>
      )}

    </div>
  )
}
