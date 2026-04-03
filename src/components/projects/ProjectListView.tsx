import { useState } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, StatusDot } from '@/components/shared/StatusBadge'
import { classifyStatus } from '@/utils/statusClassifier'
import { Modal } from '@/components/shared/Modal'
import type { Project, StatusCategory } from '@/types/project.types'
import { getMonthLabels, type MonthLabel } from '@/constants/periods'
import { EXECUTIVE_MAP } from '@/constants/executives'

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
          // colSpan=0 자식 셀은 제외 (병합 원본만 표시)
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
                  // 기간 레이블: 단일 주차 vs 복수 주차
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
  const [selected, setSelected] = useState<Project | null>(null)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📋 프로젝트 목록</h2>
        <p className="text-gray-500 text-sm mt-1">{projects.length}건</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-semibold">담당 임원</th>
              <th className="text-left px-4 py-3 text-gray-600 font-semibold">프로젝트명</th>
              <th className="text-left px-4 py-3 text-gray-600 font-semibold">발주처/시공사</th>
              <th className="text-left px-4 py-3 text-gray-600 font-semibold">월별 활동</th>
              <th className="text-left px-4 py-3 text-gray-600 font-semibold">현황</th>
              <th className="text-left px-4 py-3 text-gray-600 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map(project => {
              const exec = EXECUTIVE_MAP[project.executiveId]
              const status = getLatestStatus(project)
              const monthActivity = getMonthActivity(project)

              return (
                <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-700">{exec?.name}</span>
                    <span className="text-xs text-gray-400 ml-1">{exec?.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{project.projectName}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{project.client || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-0.5">
                      {monthActivity.map((cat, i) => <StatusDot key={i} category={cat} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge category={status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(project)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      상세보기
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="프로젝트 상세"
        size="xl"
      >
        {selected && <ProjectDetail project={selected} monthLabels={monthLabels} />}
      </Modal>
    </div>
  )
}
