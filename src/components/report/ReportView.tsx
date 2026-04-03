import { useRef, useState, useMemo } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { getMonthLabels } from '@/constants/periods'
import { classifyStatus } from '@/utils/statusClassifier'
import { EXECUTIVE_COLORS } from '@/constants/executives'
import { generatePDF } from '@/utils/pdfExporter'
import type { StatusCategory, WeekStatus, SheetPeriod } from '@/types/project.types'

const STATUS_BG: Record<StatusCategory, string> = {
  active:       '#dbeafe',
  complete:     '#dcfce7',
  pending:      '#fef9c3',
  review:       '#f3e8ff',
  construction: '#fed7aa',
  inactive:     '#f8fafc',
  empty:        '#ffffff',
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

function buildPrintRow(
  weekStatuses: WeekStatus[],
  printStartMonth: number,
  printMonths: number,
): { text: string; colSpan: number; category: StatusCategory }[] {
  const startAbs = printStartMonth * 4
  const endAbs   = (printStartMonth + printMonths) * 4

  const origins = weekStatuses
    .filter(ws => ws.colSpan !== 0)
    .map(ws => ({ ...ws, abs: ws.monthIndex * 4 + ws.weekIndex }))
    .sort((a, b) => a.abs - b.abs)

  const result: { text: string; colSpan: number; category: StatusCategory }[] = []
  let pos = startAbs

  for (const ws of origins) {
    const wsEnd = ws.abs + ws.colSpan
    if (wsEnd <= startAbs) continue
    if (ws.abs >= endAbs) break
    const cellStart = Math.max(ws.abs, startAbs)
    const cellEnd   = Math.min(wsEnd, endAbs)
    const cellSpan  = cellEnd - cellStart
    while (pos < cellStart) { result.push({ text: '', colSpan: 1, category: 'empty' }); pos++ }
    const cat = ws.text ? classifyStatus(ws.text) : 'empty'
    result.push({ text: ws.text, colSpan: cellSpan, category: cat })
    pos = cellEnd
  }
  while (pos < endAbs) { result.push({ text: '', colSpan: 1, category: 'empty' }); pos++ }
  return result
}

export function ReportView() {
  const sheet       = useActiveSheet()
  const allProjects = useFilteredProjects()
  const assigneeOverrides = useAppStore(s => s.assigneeOverrides)
  const execOrderMap = useAppStore(s => s.execOrder)
  const printRef    = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)
  const PRINT_MONTHS = 9
  const currentMonthIdx = getCurrentMonthIndex(sheet.period)
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  let printEnd = Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS)
  if (printEnd - adjustedStart < PRINT_MONTHS) {
    adjustedStart = Math.max(0, printEnd - PRINT_MONTHS)
  }
  const printMonths = printEnd - adjustedStart
  const printLabels = monthLabels.slice(adjustedStart, adjustedStart + printMonths)

  const handlePDF = async () => {
    if (!printRef.current) return
    setGenerating(true)
    try {
      await generatePDF(printRef.current, `임원회의_진행일정표_${sheet.sheetId}.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  const printProjects = allProjects.filter(p => !p.isManagerSummaryRow)

  // 임원 순서 반영한 그룹
  const execOrder = execOrderMap[sheet.sheetId] ?? []
  const grouped = useMemo(() => {
    const map = new Map<string, typeof printProjects>()
    for (const p of printProjects) {
      const arr = map.get(p.executiveId) ?? []
      arr.push(p)
      map.set(p.executiveId, arr)
    }
    return map
  }, [printProjects])

  const orderedExecs = useMemo(() => {
    const allExecs = sheet.executives
    const ordered = execOrder.length
      ? execOrder.map(id => allExecs.find(e => e.id === id)).filter(e => !!e && grouped.has(e!.id))
      : allExecs.filter(e => grouped.has(e.id))
    allExecs.forEach(e => {
      if (!ordered.find(x => x?.id === e.id) && grouped.has(e.id)) ordered.push(e)
    })
    return ordered.filter(Boolean)
  }, [sheet.executives, execOrder, grouped])

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">📄 PDF 리포트</h2>
          <p className="text-gray-500 text-sm mt-1">
            {sheet.period.label} &nbsp;|&nbsp; 출력 범위: {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length-1]?.yearShort} {printLabels[printLabels.length-1]?.label} ({printMonths}개월)
          </p>
        </div>
        <button
          onClick={handlePDF}
          disabled={generating}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
        >
          {generating ? '준비 중...' : '🖨️ 인쇄 / PDF 저장'}
        </button>
      </div>

      <div ref={printRef} className="bg-white">
        {/* 표지 */}
        <div className="p-8 text-center border-b-2 border-gray-300 print-no-break" style={{ minHeight: '100px' }}>
          <h1 className="text-xl font-bold text-gray-800 mb-1">■ 임원회의 PROJECT 진행일정표</h1>
          <p className="text-gray-500 text-sm">{sheet.period.label}</p>
          <p className="text-gray-400 text-xs mt-1">
            출력 범위: {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length-1]?.yearShort} {printLabels[printLabels.length-1]?.label}
            &nbsp;|&nbsp; 생성일: {new Date().toLocaleDateString('ko-KR')}
          </p>
        </div>

        <div className="p-2">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: '8px' }}>
            <colgroup>
              <col style={{ width: '5%' }} />   {/* 팀장 */}
              <col style={{ width: '8%' }} />   {/* 담당자 */}
              <col style={{ width: '15%' }} />  {/* 프로젝트명 */}
              {printLabels.map((_, mi) =>
                [0,1,2,3].map(wi => <col key={`${mi}_${wi}`} style={{ width: `${72 / (printMonths * 4)}%` }} />)
              )}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#374151', color: 'white' }}>
                <th className="border border-gray-400 p-1 text-center" style={{ fontSize: '8px' }}>팀장</th>
                <th className="border border-gray-400 p-1 text-center" style={{ fontSize: '8px' }}>담당자</th>
                <th className="border border-gray-400 p-1 text-left" style={{ fontSize: '8px' }}>프로젝트명</th>
                {printLabels.map((ml, mi) => (
                  <th key={mi} colSpan={4} className="border border-gray-400 p-1 text-center" style={{ fontSize: '8px' }}>
                    {ml.yearShort} {ml.label}
                  </th>
                ))}
              </tr>
              <tr style={{ backgroundColor: '#4b5563', color: 'white' }}>
                <th className="border border-gray-400 p-0.5" />
                <th className="border border-gray-400 p-0.5" />
                <th className="border border-gray-400 p-0.5" />
                {printLabels.map((_, mi) =>
                  [1,2,3,4].map(w => (
                    <th key={`${mi}_${w}`} className="border border-gray-400 p-0 text-center" style={{ fontSize: '7px', color: 'white' }}>
                      {w}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {orderedExecs.map(exec => {
                if (!exec) return null
                const execProjects = grouped.get(exec.id) ?? []
                const color = EXECUTIVE_COLORS[exec.name] ?? { bg: '#f9fafb', header: '#374151', text: '#374151' }

                return [
                  /* 임원 섹션 헤더 */
                  <tr key={`header-${exec.id}`} style={{ backgroundColor: color.header }} className="print-section-header">
                    <td colSpan={3 + printMonths * 4}
                      className="border border-gray-300 px-2 py-1 font-bold"
                      style={{ color: 'white', fontSize: '8px' }}>
                      ▶ {exec.name} {exec.title} ({execProjects.length}건)
                    </td>
                  </tr>,
                  /* 프로젝트 행 */
                  ...execProjects.map((project, pi) => {
                    const assignee = assigneeOverrides[project.id] || exec.name
                    const printCells = buildPrintRow(project.weekStatuses, adjustedStart, printMonths)
                    return (
                      <tr key={project.id}
                        style={{ backgroundColor: pi % 2 === 0 ? color.bg : '#ffffff' }}
                        className="print-no-break">
                        <td className="border border-gray-300 p-0.5 text-center align-middle" style={{ fontSize: '7px' }}>
                          <span className="font-medium" style={{ color: color.header }}>{exec.name}</span>
                        </td>
                        <td className="border border-gray-300 p-0.5 text-center align-middle" style={{ fontSize: '7px', color: color.text }}>
                          {assignee.split(',').map(s => s.trim()).filter(Boolean).join('\n')}
                        </td>
                        <td className="border border-gray-300 p-0.5 align-middle" style={{ fontSize: '7px', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                          <div className="font-medium">{project.projectName}</div>
                          {project.client && <div style={{ color: '#9ca3af', fontSize: '6px' }}>{project.client}</div>}
                        </td>
                        {printCells.map((cell, ci) => (
                          <td key={ci} colSpan={cell.colSpan}
                            className="week-cell border border-gray-200 text-center"
                            style={{
                              backgroundColor: STATUS_BG[cell.category],
                              fontSize: '6px',
                              padding: '1px 2px',
                              verticalAlign: 'middle',
                              wordBreak: 'keep-all',
                            }}>
                            {cell.text && cell.text !== '-' ? cell.text
                              : cell.text === '-' ? <span style={{ color: '#ccc' }}>-</span> : ''}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-no-break { page-break-inside: avoid; }
          .print-section-header { page-break-before: auto; }
          body { margin: 0; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
