import { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { Modal } from '@/components/shared/Modal'
import { StatusEditModal } from './StatusEditModal'
import { AddProjectModal } from './AddProjectModal'
import { getMonthLabels } from '@/constants/periods'
import { isProjectDuplicate } from '@/utils/similarity'
import { EXECUTIVE_MAP, EXECUTIVES } from '@/constants/executives'
import type { StatusCategory, Executive, SheetPeriod } from '@/types/project.types'

interface MetaEdit { id: string; projectName: string; client: string; executiveId: string }
interface DupPanel { conflicts: Array<{ id: string; text: string }>; x: number; y: number }

// 간트 상태 색상: CI 블루(진행중)·CI 그린(완료)·중성 회색만
const STATUS_CELL_BG: Record<StatusCategory, string> = {
  active:       '#e8f0f9',  // CI 블루 파스텔
  complete:     '#f0f4e3',  // CI 그린 파스텔
  pending:      '#f9fafb',
  review:       '#f9fafb',
  construction: '#f9fafb',
  inactive:     '#f9fafb',
  empty:        '#ffffff',
}
const STATUS_CELL_TEXT: Record<StatusCategory, string> = {
  active:       '#2c609e',  // CI 블루 다크
  complete:     '#556d1f',  // CI 그린 다크
  pending:      '#4b5563',
  review:       '#4b5563',
  construction: '#4b5563',
  inactive:     '#9ca3af',
  empty:        '#e2e8f0',
}

const NAME_W      = 260   // 프로젝트명 컬럼
const ASSIGNEE_W  = 72    // 담당자 컬럼
const ROW_H       = 36
const HEADER_H    = ROW_H

function getCellW(): number {
  return window.innerWidth < 768 ? 36 : 48
}

function getCurrentMonthIndex(period: SheetPeriod): number {
  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  let year = period.startYear
  let month = period.startMonth
  for (let i = 0; i < period.totalMonths; i++) {
    if (year === nowYear && month === nowMonth) return i
    month++
    if (month > 12) { month = 1; year++ }
  }
  const startAbs = period.startYear * 12 + period.startMonth
  const nowAbs   = nowYear * 12 + nowMonth
  return nowAbs > startAbs ? period.totalMonths - 1 : 0
}

export function GanttView() {
  const sheet    = useActiveSheet()
  const projects = useFilteredProjects()
  const setEditingCell    = useAppStore(s => s.setEditingCell)
  const setEditingRange   = useAppStore(s => s.setEditingRange)
  const editQueue         = useAppStore(s => s.editQueue)
  const assigneeOverrides = useAppStore(s => s.assigneeOverrides)
  const setAssignee         = useAppStore(s => s.setAssignee)
  const reorderProject      = useAppStore(s => s.reorderProject)
  const deleteProject       = useAppStore(s => s.deleteProject)
  const restoreProject      = useAppStore(s => s.restoreProject)
  const updateProjectMeta   = useAppStore(s => s.updateProjectMeta)
  const deletedProjectIds   = useAppStore(s => s.deletedProjectIds)
  const execOrderMap        = useAppStore(s => s.execOrder)
  const setExecOrderStore   = useAppStore(s => s.setExecOrder)

  const [cellW, setCellW]         = useState(getCellW)
  const [tooltip, setTooltip]     = useState<{ text: string; x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addExec, setAddExec]     = useState<Executive | null>(null)
  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null)
  const [assigneeInput, setAssigneeInput]         = useState('')
  const [editingMeta, setEditingMeta]             = useState<MetaEdit | null>(null)
  const [showDeleted, setShowDeleted]             = useState(false)
  const [dupPanel, setDupPanel]                   = useState<DupPanel | null>(null)
  const [highlightedId, setHighlightedId]         = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ projectId: string; startAbs: number; currentAbs: number } | null>(null)
  const [dragHighlight, setDragHighlight] = useState<{ projectId: string; lo: number; hi: number } | null>(null)

  const execOrder = sheet ? (execOrderMap[sheet.sheetId] ?? []) : []

  useEffect(() => {
    const onResize = () => setCellW(getCellW())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!sheet) return
    if (!execOrderMap[sheet.sheetId]?.length) {
      setExecOrderStore(sheet.sheetId, sheet.executives.map(e => e.id))
    }
  }, [sheet?.sheetId])

  useEffect(() => {
    if (!sheet || !scrollRef.current) return
    const monthIdx = getCurrentMonthIndex(sheet.period)
    scrollRef.current.scrollLeft = Math.max(0, CELL_W * 4 * Math.max(0, monthIdx - 3))
  }, [sheet?.sheetId])

  useEffect(() => {
    const onMouseUp = () => {
      if (!dragState.current) return
      const { projectId, startAbs, currentAbs } = dragState.current
      dragState.current = null
      setDragHighlight(null)
      if (startAbs === currentAbs) {
        setEditingCell({ projectId, monthIndex: Math.floor(startAbs / 4), weekIndex: startAbs % 4 })
      } else {
        setEditingRange({ projectId, startAbsWeek: startAbs, endAbsWeek: currentAbs })
      }
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [setEditingCell, setEditingRange])

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels     = getMonthLabels(sheet.period)
  const currentMonthIdx = getCurrentMonthIndex(sheet.period)

  const grouped = useMemo(() => {
    const map = new Map<string, typeof projects>()
    for (const p of projects) {
      const arr = map.get(p.executiveId) || []
      arr.push(p)
      map.set(p.executiveId, arr)
    }
    return map
  }, [projects])

  const executives: Executive[] = useMemo(() => {
    const allExecs = sheet.executives
    if (!execOrder.length) return allExecs.filter(e => grouped.has(e.id))
    const ordered = execOrder
      .map(id => allExecs.find(e => e.id === id))
      .filter((e): e is Executive => !!e && grouped.has(e.id))
    allExecs.forEach(e => {
      if (!execOrder.includes(e.id) && grouped.has(e.id)) ordered.push(e)
    })
    return ordered
  }, [sheet.executives, execOrder, grouped])

  // 유사 중복 감지 (70% 이상) → Map<id, [{id, text}]>
  const duplicateConflicts = useMemo(() => {
    const all = sheet.projects.filter(p => !p.isManagerSummaryRow && !deletedProjectIds.includes(p.id))
    const map = new Map<string, Array<{ id: string; text: string }>>()
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j]
        if (isProjectDuplicate(a.projectName, a.client, b.projectName, b.client)) {
          const bText = b.projectName + (b.client ? ` (${b.client})` : '')
          const aText = a.projectName + (a.client ? ` (${a.client})` : '')
          map.set(a.id, [...(map.get(a.id) || []), { id: b.id, text: bText }])
          map.set(b.id, [...(map.get(b.id) || []), { id: a.id, text: aText }])
        }
      }
    }
    return map
  }, [sheet.projects, deletedProjectIds])

  function moveExec(id: string, dir: -1 | 1) {
    if (!sheet) return
    const order = execOrder.length ? [...execOrder] : executives.map(e => e.id)
    const idx = order.indexOf(id)
    const next = idx + dir
    if (idx < 0 || next < 0 || next >= order.length) return
    const arr = [...order]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    setExecOrderStore(sheet.sheetId, arr)
  }

  function getCellText(projectId: string, monthIndex: number, weekIndex: number, defaultText: string): string {
    const edit = editQueue.find(e => e.projectId === projectId && e.monthIndex === monthIndex && e.weekIndex === weekIndex)
    return edit?.newText ?? defaultText
  }

  function getAssignee(projectId: string, executiveId: string): string {
    return assigneeOverrides[projectId] || EXECUTIVE_MAP[executiveId]?.name || ''
  }

  function handleDelete(projectId: string, projectName: string) {
    if (window.confirm(`"${projectName}" 프로젝트를 삭제하시겠습니까?\n(삭제된 항목은 화면 하단에서 복구할 수 있습니다)`)) {
      deleteProject(projectId)
    }
  }

  function saveMetaEdit() {
    if (!editingMeta) return
    updateProjectMeta(editingMeta.id, editingMeta.projectName.trim(), editingMeta.client.trim(), editingMeta.executiveId)
    setEditingMeta(null)
  }

  function navigateToProject(projectId: string) {
    setDupPanel(null)
    setHighlightedId(projectId)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 2500)
    const el = document.querySelector<HTMLElement>(`[data-project-id="${projectId}"]`)
    if (el && scrollRef.current) {
      const container = scrollRef.current
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const scrollTop = container.scrollTop + elRect.top - containerRect.top - container.clientHeight / 2 + elRect.height / 2
      container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
    }
  }

  if (projects.length === 0) return <div className="p-8"><EmptyState /></div>

  const CELL_W = cellW
  const totalWidth = NAME_W + ASSIGNEE_W + CELL_W * sheet.period.totalMonths * 4
  const isMobile = cellW === 36

  return (
    <div className="h-full flex flex-col">
      {/* 모바일 안내 배너 */}
      {isMobile && (
        <div className="md:hidden px-4 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700 no-print">
          간트차트는 데스크톱에서 최적화되어 있습니다. 가로 스크롤로 이용하세요.
        </div>
      )}
      <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center gap-3 no-print flex-wrap">
        <button
          onClick={() => {
            if (!scrollRef.current) return
            scrollRef.current.scrollLeft = Math.max(0, CELL_W * 4 * Math.max(0, currentMonthIdx - 3))
          }}
          className="text-xs px-3 py-1.5 text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--ci-blue)' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue-dark)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue)' }}
        >
          현재 월 이동
        </button>
        <button
          onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft = 0 }}
          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
        >
          ◀ 시작 월로
        </button>
        <span className="text-xs text-gray-500">
          현재: {monthLabels[currentMonthIdx]?.yearShort} {monthLabels[currentMonthIdx]?.label}
          {currentMonthIdx === sheet.period.totalMonths - 1 && (
            <span className="ml-1 text-gray-500">(시트 범위 밖)</span>
          )}
        </span>
        {duplicateConflicts.size > 0 && (
          <span className="text-xs font-medium text-gray-600">
            유사 중복 {duplicateConflicts.size}건 — 클릭 시 목록 확인
          </span>
        )}
        {deletedProjectIds.length > 0 && (
          <button
            onClick={() => setShowDeleted(v => !v)}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 border border-gray-300 rounded hover:bg-gray-200"
          >
            삭제된 항목 {deletedProjectIds.length}건 {showDeleted ? '▲' : '▼'}
          </button>
        )}
        <span className="text-xs text-gray-300 ml-auto">셀 클릭: 단일 입력 | 드래그: 기간 입력</span>
      </div>

      <div ref={scrollRef} className="gantt-container flex-1 relative overflow-auto select-none" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
        <div style={{ minWidth: totalWidth + 'px', width: totalWidth + 'px' }}>

          {/* 헤더: 단일 행 */}
          <div className="flex sticky top-0 z-30 bg-slate-800 text-white" style={{ height: ROW_H + 'px' }}>
            <div className="shrink-0 bg-slate-800 sticky left-0 z-40 flex">
              <div className="flex items-center px-2 text-xs font-semibold text-slate-300 border-r border-slate-600" style={{ width: NAME_W + 'px' }}>프로젝트 / 임원</div>
              <div className="flex items-center justify-center px-2 text-xs font-semibold text-slate-300 border-r border-slate-600" style={{ width: ASSIGNEE_W + 'px' }}>담당자</div>
            </div>
            {monthLabels.map((ml, mi) =>
              [1, 2, 3, 4].map(w => (
                <div key={`${mi}_${w}`}
                  className="flex items-center justify-center text-xs border-r border-slate-600 text-slate-300"
                  style={{
                    width: CELL_W + 'px',
                    backgroundColor: mi === currentMonthIdx ? 'var(--ci-blue-dark)' : undefined,
                  }}
                >{w === 1 ? ml.label : w}</div>
              ))
            )}
          </div>

          {/* 데이터 행 */}
          {executives.map((exec, execIdx) => {
            const execProjects = grouped.get(exec.id) || []
            const isCollapsed  = collapsed.has(exec.id)
            const siblingIds   = execProjects.map(p => p.id)

            return (
              <div key={exec.id}>
                {/* 임원 그룹 헤더 */}
                <div
                  className="flex items-center bg-gray-100 border-b border-gray-200 sticky z-20"
                  style={{ top: HEADER_H + 'px', height: ROW_H + 'px' }}
                >
                  <div
                    className="shrink-0 px-2 flex items-center gap-1.5 h-full sticky left-0 z-20 bg-gray-100"
                    style={{ width: NAME_W + ASSIGNEE_W + 'px' }}
                  >
                    <button
                      onClick={() => {
                        const next = new Set(collapsed)
                        next.has(exec.id) ? next.delete(exec.id) : next.add(exec.id)
                        setCollapsed(next)
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600 w-4"
                    >{isCollapsed ? '▶' : '▼'}</button>
                    <span className="font-bold text-gray-700 text-sm">{exec.name}</span>
                    <span className="text-xs text-gray-500">{exec.title}</span>
                    <span className="text-xs bg-gray-200 text-gray-700 rounded-full px-1.5 font-medium">{execProjects.length}</span>
                    <div className="flex flex-col">
                      <button onClick={() => moveExec(exec.id, -1)} disabled={execIdx === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▲</button>
                      <button onClick={() => moveExec(exec.id, 1)} disabled={execIdx === executives.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▼</button>
                    </div>
                    <button onClick={() => setAddExec(exec)}
                      className="ml-auto text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-200 font-medium">
                      + 추가
                    </button>
                  </div>
                  {monthLabels.map((_, mi) => (
                    <div key={mi}
                      className="h-full"
                      style={{
                        width: CELL_W * 4 + 'px',
                        backgroundColor: mi === currentMonthIdx ? 'var(--ci-blue-light)' : '#f3f4f6',
                      }}
                    />
                  ))}
                </div>

                {/* 프로젝트 행 */}
                {!isCollapsed && execProjects.map((project, projIdx) => {
                  const dupConflicts = duplicateConflicts.get(project.id)
                  const isDup        = !!dupConflicts
                  const assignee     = getAssignee(project.id, project.executiveId)
                  const isHighlighted = highlightedId === project.id

                  return (
                    <div
                      key={project.id}
                      data-project-id={project.id}
                      className={`flex border-b border-gray-100 transition-colors ${
                        isHighlighted ? 'bg-gray-100' :
                        isDup ? 'bg-gray-50' : ''
                      }`}
                      style={{ height: ROW_H + 'px' }}
                    >
                      {/* 프로젝트명 - sticky left 0 */}
                      <div
                        className={`name-cell shrink-0 flex items-center px-2 border-r border-gray-200 sticky left-0 z-10 ${
                          isDup ? 'bg-gray-50' : isHighlighted ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
                        }`}
                        style={{ width: NAME_W + 'px' }}
                      >
                        {/* 순서 ▲▼ */}
                        <div className="row-actions flex flex-col mr-1 shrink-0">
                          <button onClick={() => reorderProject(project.id, -1, siblingIds)} disabled={projIdx === 0}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none" title="위로">▲</button>
                          <button onClick={() => reorderProject(project.id, 1, siblingIds)} disabled={projIdx === execProjects.length - 1}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none" title="아래로">▼</button>
                        </div>

                        {/* 프로젝트명 + 발주처 */}
                        <div className="overflow-hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            {isDup && (
                              <button
                                className="text-gray-500 shrink-0 text-xs leading-none hover:scale-125 transition-transform"
                                title="클릭: 중복 프로젝트 확인"
                                onClick={e => {
                                  e.stopPropagation()
                                  setDupPanel({ conflicts: dupConflicts!, x: e.clientX, y: e.clientY })
                                }}
                              >⚠</button>
                            )}
                            <p className="text-xs font-medium truncate text-gray-700">
                              {project.projectName}
                            </p>
                          </div>
                          {project.client && (
                            <p className="text-xs truncate text-gray-400">
                              {project.client}
                            </p>
                          )}
                        </div>

                        {/* 편집/삭제 버튼 */}
                        <div className="row-actions flex items-center shrink-0 gap-0.5">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setEditingMeta({ id: project.id, projectName: project.projectName, client: project.client || '', executiveId: project.executiveId })
                            }}
                            className="text-gray-400 hover:text-gray-700 text-xs px-0.5"
                            title="수정"
                          >✎</button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(project.id, project.projectName) }}
                            className="text-gray-400 hover:text-gray-700 text-xs px-0.5"
                            title="삭제"
                          >✕</button>
                        </div>
                      </div>

                      {/* 담당자 컬럼 - sticky left NAME_W */}
                      <div
                        className={`shrink-0 flex items-center justify-center border-r border-gray-200 sticky z-10 ${isDup ? 'bg-gray-50' : 'bg-white'}`}
                        style={{ width: ASSIGNEE_W + 'px', left: NAME_W + 'px' }}
                      >
                        {editingAssigneeId === project.id ? (
                          <input
                            autoFocus
                            value={assigneeInput}
                            onChange={e => setAssigneeInput(e.target.value)}
                            onBlur={() => {
                              setAssignee(project.id, assigneeInput || assignee)
                              setEditingAssigneeId(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { setAssignee(project.id, assigneeInput || assignee); setEditingAssigneeId(null) }
                              if (e.key === 'Escape') setEditingAssigneeId(null)
                            }}
                            className="w-full border border-gray-300 rounded px-1 text-center focus:outline-none"
                            style={{ fontSize: '10px' }}
                          />
                        ) : (
                          <span
                            className="text-xs cursor-pointer hover:underline truncate px-1"
                            style={{ fontSize: '10px', color: 'var(--ci-blue)' }}
                            title="클릭하여 담당자 수정"
                            onClick={() => { setEditingAssigneeId(project.id); setAssigneeInput(assignee) }}
                          >
                            {assignee}
                          </span>
                        )}
                      </div>

                      {/* 주차 셀 */}
                      {project.weekStatuses.map((ws, wsIdx) => {
                        if (ws.colSpan === 0) return null
                        const text     = getCellText(project.id, ws.monthIndex, ws.weekIndex, ws.text)
                        const span     = ws.colSpan >= 1 ? ws.colSpan : 1
                        const absWeek  = ws.monthIndex * 4 + ws.weekIndex
                        const absEnd   = absWeek + span - 1
                        const isMonthEnd     = (absEnd + 1) % 4 === 0
                        const isCurrentMonth = ws.monthIndex === currentMonthIdx
                        const lo = dragHighlight?.projectId === project.id ? dragHighlight.lo : -1
                        const hi = dragHighlight?.projectId === project.id ? dragHighlight.hi : -1
                        const isDragHL = lo >= 0 && absWeek <= hi && absEnd >= lo

                        return (
                          <div key={wsIdx}
                            onMouseDown={e => {
                              e.preventDefault()
                              dragState.current = { projectId: project.id, startAbs: absWeek, currentAbs: absWeek }
                              setDragHighlight({ projectId: project.id, lo: absWeek, hi: absWeek })
                            }}
                            onMouseEnter={() => {
                              if (dragState.current?.projectId === project.id) {
                                dragState.current.currentAbs = absWeek
                                const lo = Math.min(dragState.current.startAbs, absWeek)
                                const hi = Math.max(dragState.current.startAbs, absWeek)
                                setDragHighlight({ projectId: project.id, lo, hi })
                              }
                            }}
                            onMouseMove={e => {
                              if (text && text !== '-' && !dragState.current) {
                                setTooltip({ text, x: e.clientX + 8, y: e.clientY + 8 })
                              }
                            }}
                            onMouseLeave={() => setTooltip(null)}
                            className={`cursor-crosshair border-r ${isMonthEnd ? 'border-gray-300' : 'border-gray-100'}`}
                            style={{
                              width: CELL_W * span + 'px',
                              minWidth: CELL_W * span + 'px',
                              height: ROW_H + 'px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isDragHL ? '#d1d9e6'
                                : ws.category !== 'empty' ? STATUS_CELL_BG[ws.category]
                                : isCurrentMonth ? '#e8f0f9' : '#ffffff',
                              color: STATUS_CELL_TEXT[ws.category],
                              fontSize: '10px',
                              padding: '0 4px',
                              flexShrink: 0,
                              direction: 'ltr',
                              unicodeBidi: 'plaintext',
                            }}
                          >
                            {text && text !== '-' ? (
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                                textAlign: 'center',
                                direction: 'ltr',
                                unicodeBidi: 'plaintext',
                              }}>
                                {text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\n]/g, ' ').trim()}
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {tooltip && (
        <div className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg p-2 max-w-xs shadow-xl pointer-events-none whitespace-pre-wrap"
          style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}

      {/* 삭제된 프로젝트 복구 패널 */}
      {showDeleted && deletedProjectIds.length > 0 && (
        <div className="no-print border-t border-gray-200 bg-gray-50 p-3 max-h-48 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-700 mb-2">삭제된 프로젝트 — 클릭하면 복구됩니다</p>
          <div className="flex flex-wrap gap-2">
            {deletedProjectIds.map(pid => {
              const p = sheet.projects.find(x => x.id === pid)
              if (!p) return null
              const exec = EXECUTIVE_MAP[p.executiveId]
              return (
                <button
                  key={pid}
                  onClick={() => restoreProject(pid)}
                  className="text-xs bg-white border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-100 text-gray-700"
                  title="클릭하여 복구"
                >
                  ↩ {p.projectName}{p.client ? ` (${p.client})` : ''} — {exec?.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <StatusEditModal />
      <AddProjectModal executive={addExec} onClose={() => setAddExec(null)} />

      {/* 프로젝트명/발주처 수정 Modal */}
      <Modal
        open={!!editingMeta}
        onClose={() => setEditingMeta(null)}
        title="프로젝트 정보 수정"
        size="sm"
      >
        {editingMeta && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                프로젝트명 <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                value={editingMeta.projectName}
                onChange={e => setEditingMeta(m => m ? { ...m, projectName: e.target.value } : m)}
                onKeyDown={e => { if (e.key === 'Enter') saveMetaEdit() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="프로젝트명 입력"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">발주처 / 시공사</label>
              <input
                value={editingMeta.client}
                onChange={e => setEditingMeta(m => m ? { ...m, client: e.target.value } : m)}
                onKeyDown={e => { if (e.key === 'Enter') saveMetaEdit() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="발주처 또는 시공사명"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">담당 임원</label>
              <select
                value={editingMeta.executiveId}
                onChange={e => setEditingMeta(m => m ? { ...m, executiveId: e.target.value } : m)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {EXECUTIVES.map(e => (
                  <option key={e.id} value={e.id}>{e.name} {e.title}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingMeta(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={saveMetaEdit}
                disabled={!editingMeta.projectName.trim()}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-40 transition-colors"
                style={{ backgroundColor: 'var(--ci-blue)' }}
                onMouseEnter={e => { if (editingMeta.projectName.trim()) e.currentTarget.style.backgroundColor = 'var(--ci-blue-dark)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue)' }}
              >
                저장
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 중복 프로젝트 이동 패널 — 클릭 위치에 표시 */}
      {dupPanel && createPortal(
        <>
          {/* 배경 클릭으로 닫기 */}
          <div className="fixed inset-0 z-40" onClick={() => setDupPanel(null)} />
          <div
            className="fixed z-50 bg-white border border-gray-300 rounded-xl shadow-2xl p-3 min-w-[220px] max-w-xs"
            style={{ left: Math.min(dupPanel.x, window.innerWidth - 260), top: Math.min(dupPanel.y + 8, window.innerHeight - 200) }}
          >
            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
              유사 중복 프로젝트 — 클릭하면 이동
            </p>
            <div className="space-y-1">
              {dupPanel.conflicts.map((c, i) => (
                <button
                  key={i}
                  onClick={() => navigateToProject(c.id)}
                  className="w-full text-left text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg px-2 py-1.5 border border-gray-200 transition-colors"
                >
                  {c.text}
                </button>
              ))}
            </div>
            <button onClick={() => setDupPanel(null)}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-center">
              닫기
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
