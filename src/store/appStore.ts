import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SheetData, SheetId, CellEdit, Project } from '@/types/project.types'
import { SHEET_IDS } from '@/types/project.types'

type ViewMode = 'dashboard' | 'gantt' | 'projects' | 'report'

interface AppState {
  // 데이터
  sheets: Partial<Record<SheetId, SheetData>>
  activeSheetId: SheetId
  editQueue: CellEdit[]
  undoStack: CellEdit[][]
  fileName: string | null

  // 필터
  selectedExecutiveIds: string[]
  searchText: string
  hideEmpty: boolean
  hideSameTaskMonths: 0 | 3 | 6 | 12

  // 담당자 & 프로젝트 순서 & 삭제
  assigneeOverrides: Record<string, string>   // projectId → 담당자명 (쉼표로 복수 가능)
  projectOrderMap: Record<string, number>     // projectId → 정렬 순서값
  deletedProjectIds: string[]                 // 삭제된 프로젝트 ID
  projectMetaEdits: Record<string, { projectName: string; client: string; executiveId?: string }>  // 이름/발주처/담당임원 수정
  execOrder: Record<string, string[]>         // sheetId → 담당임원 순서

  // UI
  viewMode: ViewMode
  selectedProjectId: string | null
  editingCell: { projectId: string; monthIndex: number; weekIndex: number } | null
  editingRange: { projectId: string; startAbsWeek: number; endAbsWeek: number } | null

  // 액션 - 데이터
  setSheets: (sheets: Record<SheetId, SheetData>, fileName: string) => void
  setActiveSheet: (sheetId: SheetId) => void
  applyEdit: (edit: CellEdit) => void
  applyRangeEdit: (projectId: string, startAbsWeek: number, endAbsWeek: number, text: string) => void
  undo: () => void
  addCustomProject: (executiveId: string, projectName: string, client: string, assignee?: string) => void

  // 액션 - 필터
  toggleExecutive: (id: string) => void
  setAllExecutives: (ids: string[]) => void
  setSearchText: (text: string) => void
  setHideEmpty: (v: boolean) => void
  setHideSameTaskMonths: (v: 0 | 3 | 6 | 12) => void

  // 액션 - 담당자 & 순서 & 삭제
  setAssignee: (projectId: string, name: string) => void
  reorderProject: (projectId: string, direction: -1 | 1, siblingIds: string[]) => void
  deleteProject: (projectId: string) => void
  restoreProject: (projectId: string) => void
  updateProjectMeta: (projectId: string, projectName: string, client: string, executiveId?: string) => void
  setExecOrder: (sheetId: string, order: string[]) => void

  // 액션 - UI
  setViewMode: (mode: ViewMode) => void
  setSelectedProject: (id: string | null) => void
  setEditingCell: (cell: { projectId: string; monthIndex: number; weekIndex: number } | null) => void
  setEditingRange: (range: { projectId: string; startAbsWeek: number; endAbsWeek: number } | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sheets: {},
      activeSheetId: '2026',
      editQueue: [],
      undoStack: [],
      fileName: null,
      selectedExecutiveIds: [],
      searchText: '',
      hideEmpty: false,
      hideSameTaskMonths: 0,
      assigneeOverrides: {},
      projectOrderMap: {},
      deletedProjectIds: [],
      projectMetaEdits: {},
      execOrder: {},
      viewMode: 'dashboard',
      selectedProjectId: null,
      editingCell: null,
      editingRange: null,

      setSheets: (sheets, fileName) => set({
        sheets,
        fileName,
        activeSheetId: SHEET_IDS.filter(id => sheets[id]).pop() || '2026',
        selectedExecutiveIds: [],
        editQueue: [],
      }),

      setActiveSheet: (sheetId) => set({ activeSheetId: sheetId, selectedExecutiveIds: [] }),

      applyEdit: (edit) => set((state) => {
        const snapshot = [...state.editQueue]
        const existing = state.editQueue.findIndex(
          e => e.projectId === edit.projectId &&
               e.monthIndex === edit.monthIndex &&
               e.weekIndex === edit.weekIndex
        )
        const newQueue = [...state.editQueue]
        if (existing >= 0) newQueue[existing] = edit
        else newQueue.push(edit)
        return {
          editQueue: newQueue,
          undoStack: [...state.undoStack.slice(-19), snapshot],
        }
      }),

      applyRangeEdit: (projectId, startAbsWeek, endAbsWeek, text) => set((state) => {
        const snapshot = [...state.editQueue]
        const start = Math.min(startAbsWeek, endAbsWeek)
        const end   = Math.max(startAbsWeek, endAbsWeek)
        const queue = [...state.editQueue]
        for (let abs = start; abs <= end; abs++) {
          const monthIndex = Math.floor(abs / 4)
          const weekIndex  = abs % 4
          const edit: CellEdit = { projectId, monthIndex, weekIndex, newText: text, timestamp: Date.now() }
          const idx = queue.findIndex(e => e.projectId === projectId && e.monthIndex === monthIndex && e.weekIndex === weekIndex)
          if (idx >= 0) queue[idx] = edit
          else queue.push(edit)
        }
        return {
          editQueue: queue,
          undoStack: [...state.undoStack.slice(-19), snapshot],
        }
      }),

      undo: () => set((state) => {
        if (state.undoStack.length === 0) return {}
        const newStack = [...state.undoStack]
        const restored = newStack.pop()!
        return { editQueue: restored, undoStack: newStack }
      }),

      addCustomProject: (executiveId, projectName, client, assignee) => set((state) => {
        const sheet = state.sheets[state.activeSheetId]
        if (!sheet) return {}
        const id = `custom_${executiveId}_${Date.now()}`
        const totalWeeks = sheet.period.totalMonths * 4
        const newProject: Project = {
          id,
          sheetId: state.activeSheetId,
          executiveId,
          name: projectName,
          projectName,
          client,
          rowIndex: 9000 + sheet.projects.length,
          weekStatuses: Array.from({ length: totalWeeks }, (_, i) => ({
            monthIndex: Math.floor(i / 4),
            weekIndex: i % 4,
            text: '',
            colSpan: 1,
            category: 'empty' as const,
          })),
          isManagerSummaryRow: false,
        }
        const newAssignees = assignee
          ? { ...state.assigneeOverrides, [id]: assignee }
          : state.assigneeOverrides
        return {
          sheets: {
            ...state.sheets,
            [state.activeSheetId]: { ...sheet, projects: [...sheet.projects, newProject] },
          },
          assigneeOverrides: newAssignees,
        }
      }),

      toggleExecutive: (id) => set((state) => {
        const sel = state.selectedExecutiveIds
        return { selectedExecutiveIds: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] }
      }),

      setAllExecutives: (ids) => set({ selectedExecutiveIds: ids }),
      setSearchText: (text) => set({ searchText: text }),
      setHideEmpty: (v) => set({ hideEmpty: v }),
      setHideSameTaskMonths: (v) => set({ hideSameTaskMonths: v }),

      setAssignee: (projectId, name) => set((state) => ({
        assigneeOverrides: { ...state.assigneeOverrides, [projectId]: name },
      })),

      reorderProject: (projectId, direction, siblingIds) => set((state) => {
        const orderMap = { ...state.projectOrderMap }
        // 현재 순서값 초기화 (없으면 index * 10)
        siblingIds.forEach((id, i) => {
          if (orderMap[id] === undefined) orderMap[id] = i * 10
        })
        const sorted = [...siblingIds].sort((a, b) => orderMap[a] - orderMap[b])
        const idx = sorted.indexOf(projectId)
        const targetIdx = idx + direction
        if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return {}
        const targetId = sorted[targetIdx]
        const tmp = orderMap[projectId]
        orderMap[projectId] = orderMap[targetId]
        orderMap[targetId] = tmp
        return { projectOrderMap: orderMap }
      }),

      deleteProject: (projectId) => set((state) => ({
        deletedProjectIds: [...state.deletedProjectIds, projectId],
      })),

      restoreProject: (projectId) => set((state) => ({
        deletedProjectIds: state.deletedProjectIds.filter(id => id !== projectId),
      })),

      updateProjectMeta: (projectId, projectName, client, executiveId) => set((state) => {
        const meta: { projectName: string; client: string; executiveId?: string } = { projectName, client }
        if (executiveId) meta.executiveId = executiveId
        // 담당임원 변경 시 sheets도 업데이트
        let sheets = state.sheets
        if (executiveId) {
          sheets = { ...state.sheets }
          for (const id of SHEET_IDS) {
            const sheet = sheets[id]
            if (!sheet) continue
            const idx = sheet.projects.findIndex(p => p.id === projectId)
            if (idx >= 0) {
              const updated = [...sheet.projects]
              updated[idx] = { ...updated[idx], executiveId }
              sheets[id] = { ...sheet, projects: updated }
              break
            }
          }
        }
        return { projectMetaEdits: { ...state.projectMetaEdits, [projectId]: meta }, sheets }
      }),

      setExecOrder: (sheetId, order) => set((state) => ({
        execOrder: { ...state.execOrder, [sheetId]: order },
      })),

      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedProject: (id) => set({ selectedProjectId: id }),
      setEditingCell: (cell) => set({ editingCell: cell }),
      setEditingRange: (range) => set({ editingRange: range }),
    }),
    {
      name: 'exec-dashboard-store',
      partialize: (state) => ({
        sheets: state.sheets,
        activeSheetId: state.activeSheetId,
        editQueue: state.editQueue,
        fileName: state.fileName,
        assigneeOverrides: state.assigneeOverrides,
        projectOrderMap: state.projectOrderMap,
        deletedProjectIds: state.deletedProjectIds,
        projectMetaEdits: state.projectMetaEdits,
        execOrder: state.execOrder,
      }),
    }
  )
)
