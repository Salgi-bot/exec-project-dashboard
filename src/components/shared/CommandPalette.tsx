import { useEffect, useMemo, useState, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { useActiveSheet } from '@/hooks/useFilteredProjects'
import { SHEET_IDS } from '@/types/project.types'

interface Command {
  id: string
  label: string
  category: string
  hint?: string
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const setViewMode        = useAppStore(s => s.setViewMode)
  const setActiveSheet     = useAppStore(s => s.setActiveSheet)
  const sheets             = useAppStore(s => s.sheets)
  const setSelectedProject = useAppStore(s => s.setSelectedProject)
  const deletedProjectIds  = useAppStore(s => s.deletedProjectIds)
  const projectMetaEdits   = useAppStore(s => s.projectMetaEdits)
  const activeSheet        = useActiveSheet()

  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []

    // 뷰 전환
    list.push({ id: 'view-dashboard', label: '대시보드',       category: '뷰', onSelect: () => { setViewMode('dashboard'); onClose() } })
    list.push({ id: 'view-gantt',     label: '간트차트',       category: '뷰', onSelect: () => { setViewMode('gantt');     onClose() } })
    list.push({ id: 'view-projects',  label: '프로젝트 목록',   category: '뷰', onSelect: () => { setViewMode('projects');  onClose() } })
    list.push({ id: 'view-report',    label: '출력',          category: '뷰', onSelect: () => { setViewMode('report');    onClose() } })

    // 연도(시트) 전환
    SHEET_IDS.forEach(id => {
      const s = sheets[id]
      if (s) {
        list.push({
          id: `sheet-${id}`,
          label: s.period.label,
          category: '연도',
          hint: id,
          onSelect: () => { setActiveSheet(id); onClose() },
        })
      }
    })

    // 프로젝트 검색 (현재 활성 시트의 프로젝트)
    if (activeSheet) {
      const seen = new Set<string>()
      activeSheet.projects.forEach(p => {
        if (p.isManagerSummaryRow) return
        if (deletedProjectIds.includes(p.id)) return
        if (seen.has(p.id)) return
        seen.add(p.id)
        const meta = projectMetaEdits[p.id]
        const name = meta?.projectName ?? p.projectName
        const client = meta?.client ?? p.client
        list.push({
          id: `project-${p.id}`,
          label: name,
          category: '프로젝트',
          hint: client || undefined,
          onSelect: () => {
            setSelectedProject(p.id)
            setViewMode('projects')
            onClose()
          },
        })
      })
    }

    return list
  }, [sheets, activeSheet, deletedProjectIds, projectMetaEdits, setViewMode, setActiveSheet, setSelectedProject, onClose])

  // 필터링
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase().replace(/\s+/g, '')
    return commands.filter(c => {
      const haystack = (c.label + (c.hint ?? '') + c.category).toLowerCase().replace(/\s+/g, '')
      return haystack.includes(q)
    })
  }, [query, commands])

  // 카테고리별 그룹
  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const c of filtered) {
      const arr = map.get(c.category) ?? []
      arr.push(c)
      map.set(c.category, arr)
    }
    return map
  }, [filtered])

  // 평면 인덱스 (키보드 네비게이션용)
  const flatList = useMemo(() => filtered, [filtered])

  // 모달 오픈 시 input focus + 상태 초기화
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      // focus는 다음 tick에 (트랜지션 직후)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // 검색어 변경 시 첫 항목으로
  useEffect(() => { setSelectedIdx(0) }, [query])

  // 선택 항목 화면 안으로 스크롤
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  // 키보드 이벤트
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, flatList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        flatList[selectedIdx]?.onSelect()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, flatList, selectedIdx, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center pt-[15vh] no-print"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[65vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <span className="text-gray-400 text-sm">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="명령 검색... (뷰 · 연도 · 프로젝트명 · 발주처)"
            className="flex-1 text-sm focus:outline-none placeholder-gray-400"
          />
        </div>

        {/* 결과 목록 */}
        <div ref={listRef} className="overflow-y-auto flex-1 py-2">
          {flatList.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">결과 없음</div>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="mb-1">
                <div className="text-xs text-gray-400 font-semibold px-4 py-1.5 uppercase tracking-wider">
                  {category}
                </div>
                {items.map(cmd => {
                  const idx = flatList.indexOf(cmd)
                  const isSelected = idx === selectedIdx
                  return (
                    <button
                      key={cmd.id}
                      data-cmd-idx={idx}
                      onClick={() => cmd.onSelect()}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      style={isSelected ? { color: 'var(--ci-blue-dark)' } : undefined}
                    >
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="text-xs text-gray-400 truncate ml-2">{cmd.hint}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* 하단 안내 */}
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400 flex items-center justify-between">
          <span>↑↓ 이동 · Enter 선택 · ESC 닫기</span>
          <span>{flatList.length}건</span>
        </div>
      </div>
    </div>
  )
}
