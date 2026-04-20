import { useMemo } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Project, WeekStatus } from '@/types/project.types'
import { classifyStatus } from '@/utils/statusClassifier'
import { EXECUTIVE_MAP } from '@/constants/executives'

// 편집 적용 후 연속된 동일 텍스트 셀을 하나의 병합 셀로 합침
// (범위 편집 시 여러 달에 걸친 같은 업무가 하나의 바로 표시되도록)
function mergeConsecutiveSameText(weekStatuses: WeekStatus[]): WeekStatus[] {
  const ws = weekStatuses.map(s => ({ ...s }))
  let i = 0
  while (i < ws.length) {
    if (ws[i].colSpan === 0 || !ws[i].text || ws[i].text === '-') { i++; continue }
    const text = ws[i].text
    let span = ws[i].colSpan >= 1 ? ws[i].colSpan : 1
    let j = i + span
    while (j < ws.length && ws[j].colSpan !== 0 && ws[j].text === text) {
      span += ws[j].colSpan >= 1 ? ws[j].colSpan : 1
      j = i + span
    }
    ws[i] = { ...ws[i], colSpan: span }
    for (let k = i + 1; k < i + span && k < ws.length; k++) {
      ws[k] = { ...ws[k], colSpan: 0 }
    }
    i += span
  }
  return ws
}

// 내용 없는 프로젝트 판별 (모든 주차가 빈칸 또는 '-')
function isAllEmpty(project: Project): boolean {
  return project.weekStatuses.every(ws => !ws.text || ws.text === '-')
}

// 가장 긴 동일 업무 연속 주차 수 반환
function getLongestSameTaskWeeks(project: Project): number {
  let maxRun = 0
  let currentText = ''
  let currentRun = 0
  for (const ws of project.weekStatuses) {
    if (ws.colSpan === 0) continue // 병합 자식 셀 건너뜀
    const text = ws.text?.trim() || ''
    if (!text || text === '-') {
      currentText = ''
      currentRun = 0
    } else if (text === currentText) {
      currentRun += ws.colSpan >= 1 ? ws.colSpan : 1
    } else {
      currentText = text
      currentRun = ws.colSpan >= 1 ? ws.colSpan : 1
    }
    maxRun = Math.max(maxRun, currentRun)
  }
  return maxRun
}

export function useFilteredProjects(): Project[] {
  const sheets = useAppStore(s => s.sheets)
  const activeSheetId = useAppStore(s => s.activeSheetId)
  const selectedExecutiveIds = useAppStore(s => s.selectedExecutiveIds)
  const searchText = useAppStore(s => s.searchText)
  const editQueue = useAppStore(s => s.editQueue)
  const assigneeOverrides = useAppStore(s => s.assigneeOverrides)
  const hideEmpty = useAppStore(s => s.hideEmpty)
  const hideSameTaskMonths = useAppStore(s => s.hideSameTaskMonths)
  const projectOrderMap    = useAppStore(s => s.projectOrderMap)
  const deletedProjectIds  = useAppStore(s => s.deletedProjectIds)
  const projectMetaEdits   = useAppStore(s => s.projectMetaEdits)

  return useMemo(() => {
    const sheet = sheets[activeSheetId]
    if (!sheet) return []

    // 편집 내역 반영
    const projects = sheet.projects.map(p => {
      // 프로젝트명/발주처 수정 적용
      const meta = projectMetaEdits[p.id]
      const base = meta
        ? { ...p, projectName: meta.projectName, client: meta.client, name: meta.projectName, ...(meta.executiveId ? { executiveId: meta.executiveId } : {}) }
        : p

      const edits = editQueue.filter(e => e.projectId === p.id)
      if (edits.length === 0) return base
      const edited = base.weekStatuses.map(ws => {
        const edit = edits.find(e => e.monthIndex === ws.monthIndex && e.weekIndex === ws.weekIndex)
        if (!edit) return ws
        return { ...ws, text: edit.newText, category: classifyStatus(edit.newText) } as WeekStatus
      })
      return { ...base, weekStatuses: mergeConsecutiveSameText(edited) }
    })

    return projects.filter(p => {
      if (deletedProjectIds.includes(p.id)) return false
      if (selectedExecutiveIds.length > 0 && !selectedExecutiveIds.includes(p.executiveId)) return false
      if (searchText) {
        const q = searchText.toLowerCase()
        const assignee = assigneeOverrides[p.id] || EXECUTIVE_MAP[p.executiveId]?.name || ''
        const cellTexts = p.weekStatuses.map(ws => ws.text || '').join(' ')
        const searchTarget = [
          p.projectName,
          p.client,
          assignee,
          cellTexts,
        ].join(' ').toLowerCase()
        if (!searchTarget.includes(q)) return false
      }
      if (hideEmpty && isAllEmpty(p)) return false
      if (hideSameTaskMonths > 0 && getLongestSameTaskWeeks(p) >= hideSameTaskMonths * 4) return false
      return true
    }).sort((a, b) => {
      // 팀장 범위 내 프로젝트 순서 적용
      const oa = projectOrderMap[a.id] ?? a.rowIndex
      const ob = projectOrderMap[b.id] ?? b.rowIndex
      return oa - ob
    })
  }, [sheets, activeSheetId, selectedExecutiveIds, searchText, editQueue, assigneeOverrides, hideEmpty, hideSameTaskMonths, projectOrderMap, deletedProjectIds, projectMetaEdits])
}

export function useActiveSheet() {
  const sheets = useAppStore(s => s.sheets)
  const activeSheetId = useAppStore(s => s.activeSheetId)
  return sheets[activeSheetId]
}
