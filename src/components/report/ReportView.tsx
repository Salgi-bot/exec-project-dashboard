import { useRef, useState } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { EmptyState } from '@/components/shared/EmptyState'
import { getMonthLabels } from '@/constants/periods'
import { classifyStatus } from '@/utils/statusClassifier'
import type { StatusCategory, WeekStatus, SheetPeriod } from '@/types/project.types'
import { EXECUTIVE_MAP } from '@/constants/executives'
import { generatePDF } from '@/utils/pdfExporter'

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

// 출력 범위에 맞게 weekStatuses를 재구성 (12개월 window)
function buildPrintRow(
  weekStatuses: WeekStatus[],
  printStartMonth: number,
  printMonths: number,
): { text: string; colSpan: number; category: StatusCategory }[] {
  const startAbs = printStartMonth * 4
  const endAbs   = (printStartMonth + printMonths) * 4  // exclusive

  // origin 셀만 추출 + abs 위치 계산
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

    // 빈 칸 채우기
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
  const printRef    = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)

  // 현재 월 기준 -3개월 ~ A4 가로 맞춤 (총 9개월)
  // A4 landscape에서 담당+프로젝트명 60mm, 나머지 227mm → 9개월×4주=36열×6.3mm = 깔끔
  const PRINT_MONTHS = 9
  const currentMonthIdx = getCurrentMonthIndex(sheet.period)
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  let printEnd = Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS)
  // 끝쪽에 붙었으면 시작을 당겨서 항상 PRINT_MONTHS 유지
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

  // 출력할 프로젝트: 임원 순서 유지, isManagerSummaryRow 제외
  const printProjects = allProjects.filter(p => !p.isManagerSummaryRow)

  return (
    <div className="p-6">
      {/* 컨트롤 */}
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

      {/* 프린트 영역 */}
      <div ref={printRef} className="bg-white">
        {/* 표지 */}
        <div className="p-8 text-center border-b-2 border-gray-300" style={{ minHeight: '120px' }}>
          <h1 className="text-xl font-bold text-gray-800 mb-1">■ 임원회의 PROJECT 진행일정표</h1>
          <p className="text-gray-500 text-sm">{sheet.period.label}</p>
          <p className="text-gray-400 text-xs mt-1">
            출력 범위: {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length-1]?.yearShort} {printLabels[printLabels.length-1]?.label}
            &nbsp;|&nbsp; 생성일: {new Date().toLocaleDateString('ko-KR')}
          </p>
        </div>

        {/* 전체 연속 테이블 */}
        <div className="p-3">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: '9px' }}>
            <colgroup>
              {/* 팀장: 6% */}
              <col style={{ width: '6%' }} />
              {/* 프로젝트명: 18% — 전체 노출 위해 충분히 확보 */}
              <col style={{ width: '18%' }} />
              {/* 주차 셀: 나머지 76% */}
              {printLabels.map((_, mi) =>
                [0,1,2,3].map(wi => <col key={`${mi}_${wi}`} style={{ width: `${76 / (printMonths * 4)}%` }} />)
              )}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#374151', color: 'white' }}>
                <th className="border border-gray-400 p-1 text-center" style={{ fontSize: '9px' }}>팀장</th>
                <th className="border border-gray-400 p-1 text-left" style={{ fontSize: '9px' }}>프로젝트명</th>
                {printLabels.map((ml, mi) => (
                  <th key={mi} colSpan={4} className="border border-gray-400 p-1 text-center" style={{ fontSize: '9px' }}>
                    {ml.yearShort} {ml.label}
                  </th>
                ))}
              </tr>
              <tr style={{ backgroundColor: '#4b5563', color: 'white' }}>
                <th className="border border-gray-400 p-0.5" />
                <th className="border border-gray-400 p-0.5" />
                {printLabels.map((_, mi) =>
                  [1,2,3,4].map(w => (
                    <th key={`${mi}_${w}`} className="border border-gray-400 p-0 text-center" style={{ fontSize: '7px' }}>
                      {w}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {printProjects.map((project, pi) => {
                const exec = EXECUTIVE_MAP[project.executiveId]
                const printCells = buildPrintRow(project.weekStatuses, adjustedStart, printMonths)
                return (
                  <tr key={project.id} style={{ backgroundColor: pi % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td className="border border-gray-300 p-0.5 text-center" style={{ fontSize: '8px', verticalAlign: 'middle' }}>
                      <span className="font-medium">{exec?.name}</span>
                    </td>
                    <td className="border border-gray-300 p-0.5" style={{ fontSize: '8px', verticalAlign: 'middle', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                      <div className="font-medium">{project.projectName}</div>
                      {project.client && <div style={{ color: '#9ca3af' }}>{project.client}</div>}
                    </td>
                    {printCells.map((cell, ci) => (
                      <td
                        key={ci}
                        colSpan={cell.colSpan}
                        className="week-cell border border-gray-200 text-center"
                        style={{
                          backgroundColor: STATUS_BG[cell.category],
                          fontSize: '7px',
                          padding: '1px 2px',
                          verticalAlign: 'middle',
                          wordBreak: 'keep-all',
                          overflowWrap: 'break-word',
                          whiteSpace: 'normal',
                        }}
                      >
                        {cell.text && cell.text !== '-' ? cell.text
                          : cell.text === '-' ? <span style={{ color: '#ccc' }}>-</span> : ''}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
