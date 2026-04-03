import { useState, useMemo } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, StatusDot } from '@/components/shared/StatusBadge'
import { Modal } from '@/components/shared/Modal'
import { classifyStatus } from '@/utils/statusClassifier'
import type { Project, StatusCategory, Executive } from '@/types/project.types'
import { getMonthLabels, type MonthLabel } from '@/constants/periods'
import { EXECUTIVE_MAP, EXECUTIVE_COLORS } from '@/constants/executives'

function getLatestStatus(project: Project): StatusCategory {
  const found = [...project.weekStatuses].reverse().find(ws => ws.text && ws.text !== '-')
  return found ? classifyStatus(found.text) : 'empty'
}

function getMonthActivity(project: Project): StatusCategory[] {
  return Array.from({ length: 12 }, (_, m) => {
    const active = project.weekStatuses.find(ws => ws.monthIndex === m && ws.text && ws.text !== '-')
    return active ? classifyStatus(active.text) : 'empty' as StatusCategory
  })
}

interface ProjectDetailProps {
  project: Project
  monthLabels: MonthLabel[]
}

function ProjectDetail({ project, monthLabels }: ProjectDetailProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-bold text-gray-800">{project.projectName}</p>
        {project.client && <p className="text-gray-500">{project.client}</p>}
        <p className="text-sm text-gray-400 mt-1">
          담당: {EXECUTIVE_MAP[project.executiveId]?.name} {EXECUTIVE_MAP[project.executiveId]?.title}
        </p>
      </div>
      <div className="space-y-3">
        {monthLabels.map((ml, mi) => {
          const monthLabel = `${ml.yearShort} ${ml.label}`
          const visibleWeeks = project.weekStatuses.filter(
            ws => ws.monthIndex === mi && ws.colSpan !== 0
          )
          const hasContent = visibleWeeks.some(ws => ws.text && ws.text !== '-')
          if (!hasContent) return null
          return (
            <div key={mi} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">{monthLabel}</p>
              <div className="space-y-1.5">
                {visibleWeeks.map(ws => {
                  if (!ws.text || ws.text === '-') return null
                  const endWeek = ws.weekIndex + ws.colSpan - 1
                  const endMonthOffset = Math.floor(endWeek / 4)
                  let rangeLabel = `${ws.weekIndex + 1}주차`
                  if (ws.colSpan > 1) {
                    if (endMonthOffset > 0 && mi + endMonthOffset < monthLabels.length) {
                      const endMl = monthLabels[mi + endMonthOffset]
                      rangeLabel = `${ws.weekIndex + 1}주 ~ ${endMl.yearShort} ${endMl.label} ${(endWeek % 4) + 1}주`
                    } else {
                      rangeLabel = `${ws.weekIndex + 1}주차 ~ ${(endWeek % 4) + 1}주차`
                    }
                  }
                  return (
                    <div key={ws.weekIndex} className="bg-white rounded p-2 border border-gray-200">
                      <p className="text-xs text-blue-500 font-medium mb-1">{rangeLabel}</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{ws.text}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProjectListView() {
  const sheet = useActiveSheet()
  const projects = useFilteredProjects()
  const assigneeOverrides = useAppStore(s => s.assigneeOverrides)
  const execOrderMap = useAppStore(s => s.execOrder)
  const setExecOrderStore = useAppStore(s => s.setExecOrder)
  const [selected, setSelected] = useState<Project | null>(null)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)
  const execOrder = sheet ? (execOrderMap[sheet.sheetId] ?? []) : []

  // 임원별 그룹핑 (execOrder 순서 유지)
  const grouped = useMemo(() => {
    const map = new Map<string, Project[]>()
    for (const p of projects) {
      if (p.isManagerSummaryRow) continue
      const arr = map.get(p.executiveId) ?? []
      arr.push(p)
      map.set(p.executiveId, arr)
    }
    return map
  }, [projects])

  const executives: Executive[] = useMemo(() => {
    const allExecs = sheet.executives
    const ordered = execOrder.length
      ? execOrder.map(id => allExecs.find(e => e.id === id)).filter((e): e is Executive => !!e && grouped.has(e.id))
      : allExecs.filter(e => grouped.has(e.id))
    allExecs.forEach(e => {
      if (!ordered.find(x => x.id === e.id) && grouped.has(e.id)) ordered.push(e)
    })
    return ordered
  }, [sheet.executives, execOrder, grouped])

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

  const totalProjects = [...grouped.values()].reduce((s, g) => s + g.length, 0)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📋 프로젝트 목록</h2>
        <p className="text-gray-500 text-sm mt-1">{totalProjects}건 / {executives.length}명</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-3 text-gray-600 font-semibold w-24">담당임원</th>
              <th className="text-left px-3 py-3 text-gray-600 font-semibold w-20">담당자</th>
              <th className="text-left px-3 py-3 text-gray-600 font-semibold">프로젝트명</th>
              <th className="text-left px-3 py-3 text-gray-600 font-semibold w-32">발주처/시공사</th>
              <th className="text-left px-3 py-3 text-gray-600 font-semibold w-36">월별 활동</th>
              <th className="text-left px-3 py-3 text-gray-600 font-semibold w-20">현황</th>
              <th className="px-3 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {executives.map((exec, execIdx) => {
              const execProjects = grouped.get(exec.id) ?? []
              const color = EXECUTIVE_COLORS[exec.name] ?? { bg: '#f9fafb', header: '#374151', text: '#374151' }

              return execProjects.map((project, projIdx) => {
                const status = getLatestStatus(project)
                const monthActivity = getMonthActivity(project)
                const assignee = assigneeOverrides[project.id] || exec.name
                const assigneeNames = assignee.split(',').map(s => s.trim()).filter(Boolean)

                return (
                  <tr
                    key={project.id}
                    className="border-b border-gray-100 hover:brightness-95 transition-all"
                    style={{ backgroundColor: color.bg }}
                  >
                    {/* 담당임원 셀 - 첫 번째 프로젝트만 rowspan으로 병합 */}
                    {projIdx === 0 && (
                      <td
                        rowSpan={execProjects.length}
                        className="px-3 py-2 border-r border-gray-200 align-middle"
                        style={{ borderLeft: `4px solid ${color.header}` }}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-sm" style={{ color: color.header }}>{exec.name}</span>
                            <span className="text-xs text-gray-400">{exec.title}</span>
                          </div>
                          <span className="text-xs text-gray-400">{execProjects.length}건</span>
                          <div className="flex gap-0.5 mt-1">
                            <button onClick={() => moveExec(exec.id, -1)} disabled={execIdx === 0}
                              className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 border border-gray-200 rounded px-1 bg-white">▲</button>
                            <button onClick={() => moveExec(exec.id, 1)} disabled={execIdx === executives.length - 1}
                              className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 border border-gray-200 rounded px-1 bg-white">▼</button>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 border-r border-gray-200 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {assigneeNames.map((name, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: color.header + '20', color: color.header }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800 text-sm">{project.projectName}</p>
                      {project.client && <p className="text-xs text-gray-400 mt-0.5">{project.client}</p>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{project.client || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5">
                        {monthActivity.map((cat, i) => <StatusDot key={i} category={cat} />)}
                      </div>
                    </td>
                    <td className="px-3 py-2"><StatusBadge category={status} /></td>
                    <td className="px-3 py-2">
                      <button onClick={() => setSelected(project)}
                        className="text-xs text-blue-600 hover:underline">상세보기</button>
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="프로젝트 상세" size="xl">
        {selected && <ProjectDetail project={selected} monthLabels={monthLabels} />}
      </Modal>
    </div>
  )
}
