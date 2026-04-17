import { useRef, useState, useMemo } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { getMonthLabels } from '@/constants/periods'
import { classifyStatus } from '@/utils/statusClassifier'
import { generatePDF } from '@/utils/pdfExporter'
import type { StatusCategory, WeekStatus, SheetPeriod } from '@/types/project.types'

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
  const execOrderMap = useAppStore(s => s.execOrder)
  const printRef    = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)
  const PRINT_MONTHS = 5  // 과거3 + 현재1 + 미래1
  const currentMonthIdx = getCurrentMonthIndex(sheet.period)
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  let printEnd = Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS)
  if (printEnd - adjustedStart < PRINT_MONTHS) {
    adjustedStart = Math.max(0, printEnd - PRINT_MONTHS)
  }
  const printMonths = printEnd - adjustedStart
  const printLabels = monthLabels.slice(adjustedStart, adjustedStart + printMonths)

  const handlePDF = () => {
    setGenerating(true)
    try {
      generatePDF()
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

  // 팀장 컬럼 rowspan용 데이터
  const execRowsData = useMemo(() => {
    return orderedExecs.map(exec => {
      if (!exec) return null
      const projects = grouped.get(exec.id) ?? []
      return { exec, projects }
    }).filter(Boolean) as { exec: typeof orderedExecs[0]; projects: typeof printProjects }[]
  }, [orderedExecs, grouped])

  // 2페이지 고정용 가변 행높이 (임원헤더 행 제거 후)
  // A4 가로 2장 = (210-16)mm × 2 = 388mm. 배너 ~14mm + thead×2 ~22mm = 36mm 소요.
  // tbody 가용 = 352mm = ~1331px(@96dpi). 행 자연높이 ≈ font + 1.5px.
  const totalRows = execRowsData.reduce((sum, e) => sum + e.projects.length, 0)
  const rawFont = totalRows > 0 ? 1331 / totalRows - 1.5 : 9
  const bodyFont = Math.max(5.5, Math.min(9, rawFont))
  const cellFont = Math.max(5, bodyFont - 0.5)
  const headerFont = Math.max(6, Math.min(9, bodyFont))

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">■ PDF 리포트</h2>
          <p className="text-gray-500 text-sm mt-1">
            {sheet.period.label} | 출력 범위: {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length-1]?.yearShort} {printLabels[printLabels.length-1]?.label}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handlePDF}
            disabled={generating}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {generating ? '준비 중...' : '인쇄 / PDF 저장'}
          </button>
          <span className="text-xs text-gray-500">인쇄 대화상자에서 <b>방향: 세로</b> 선택</span>
        </div>
      </div>

      <div ref={printRef} className="bg-white print-area">
        {/* 제목만 */}
        <div className="px-2 py-1 border-b border-gray-400 print-no-break">
          <h1 className="font-bold text-gray-800" style={{ fontSize: '13px' }}>■ 임원회의 PROJECT 진행일정표</h1>
        </div>

        <div className="px-2 pt-1">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: `${bodyFont}px` }}>
            <colgroup>
              <col style={{ width: '10%' }} />  {/* 팀장 */}
              <col style={{ width: '22%' }} />  {/* 프로젝트명 */}
              {printLabels.map((_, mi) =>
                [0,1,2,3].map(wi => <col key={`${mi}_${wi}`} style={{ width: `${68 / (printMonths * 4)}%` }} />)
              )}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>
                <th className="border border-gray-400 p-0.5 text-center" style={{ fontSize: `${headerFont}px` }}>팀장</th>
                <th className="border border-gray-400 p-0.5 text-left" style={{ fontSize: `${headerFont}px` }}>프로젝트명</th>
                {printLabels.map((ml, mi) => {
                  const showYear = mi === 0 || (mi > 0 && ml.yearShort !== printLabels[mi - 1].yearShort)
                  return (
                    <th key={mi} colSpan={4} className="border border-gray-400 p-0.5 text-center" style={{ fontSize: `${headerFont}px` }}>
                      {showYear ? `${ml.yearShort} ` : ''}{ml.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {execRowsData.map(({ exec, projects }) => {
                if (!exec) return null
                return projects.map((project, pi) => {
                  const isFirstInExec = pi === 0
                  const printCells = buildPrintRow(project.weekStatuses, adjustedStart, printMonths)
                  return (
                    <tr key={project.id} className="print-no-break" style={{ lineHeight: 1.2 }}>
                      {isFirstInExec && (
                        <td rowSpan={projects.length}
                          className="border border-gray-400 text-center align-middle font-medium"
                          style={{
                            fontSize: `${bodyFont}px`,
                            padding: '2px',
                            wordBreak: 'keep-all',
                          }}>
                          {exec.name}
                        </td>
                      )}
                      <td className="border border-gray-300 align-middle"
                        style={{
                          fontSize: `${bodyFont}px`,
                          padding: '2px 3px',
                          whiteSpace: 'normal',
                          wordBreak: 'keep-all',
                          overflowWrap: 'break-word',
                        }}>
                        {project.projectName}
                      </td>
                      {printCells.map((cell, ci) => (
                        <td key={ci} colSpan={cell.colSpan}
                          className="week-cell border border-gray-200 text-center align-middle"
                          style={{
                            fontSize: `${cellFont}px`,
                            padding: '2px 2px',
                            whiteSpace: 'normal',
                            wordBreak: 'keep-all',
                            overflowWrap: 'break-word',
                          }}>
                          {cell.text && cell.text !== '-' ? cell.text
                            : cell.text === '-' ? <span style={{ color: '#ccc' }}>-</span> : ''}
                        </td>
                      ))}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-no-break { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
