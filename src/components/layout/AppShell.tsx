import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '@/store/appStore'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { GanttView } from '@/components/gantt/GanttView'
import { ProjectListView } from '@/components/projects/ProjectListView'
import { ReportView } from '@/components/report/ReportView'

export function AppShell() {
  const viewMode = useAppStore(s => s.viewMode)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
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
