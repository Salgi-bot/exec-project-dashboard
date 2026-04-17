import { useRef, useState, useMemo } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { getMonthLabels } from '@/constants/periods'
import { classifyStatus } from '@/utils/statusClassifier'
import { generatePDF } from '@/utils/pdfExporter'
import type { StatusCategory, WeekStatus, SheetPeriod } from '@/types/project.types'

// 간트와 동일한 상태 셀 색상
const STATUS_CELL_BG: Record<StatusCategory, string> = {
  active:       '#e8f0f9',
  complete:     '#f0f4e3',
  pending:      '#f9fafb',
  review:       '#f9fafb',
  construction: '#f9fafb',
  inactive:     '#f9fafb',
  empty:        '#ffffff',
}
const STATUS_CELL_TEXT: Record<StatusCategory, string> = {
  active:       '#2c609e',
  complete:     '#556d1f',
  pending:      '#000000',
  review:       '#000000',
  construction: '#000000',
  inactive:     '#6b7280',
  empty:        '#000000',
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
    // 텍스트 없는 origin은 empty 구간으로 흘려보내 머지되도록 제외 ('-'는 유지)
    .filter(ws => ws.text !== '' && ws.text != null)
    .map(ws => ({ ...ws, abs: ws.monthIndex * 4 + ws.weekIndex }))
    .sort((a, b) => a.abs - b.abs)

  const result: { text: string; colSpan: number; category: StatusCategory }[] = []
  let pos = startAbs

  const pushEmpty = (span: number) => {
    if (span <= 0) return
    result.push({ text: '', colSpan: span, category: 'empty' })
  }

  for (const ws of origins) {
    const wsEnd = ws.abs + ws.colSpan
    if (wsEnd <= startAbs) continue
    if (ws.abs >= endAbs) break
    const cellStart = Math.max(ws.abs, startAbs)
    const cellEnd   = Math.min(wsEnd, endAbs)
    const cellSpan  = cellEnd - cellStart
    pushEmpty(cellStart - pos)
    const cat = ws.text ? classifyStatus(ws.text) : 'empty'
    result.push({ text: ws.text, colSpan: cellSpan, category: cat })
    pos = cellEnd
  }
  pushEmpty(endAbs - pos)
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

  // 2페이지 꽉 채우기: tbody 가용 = 506mm(2장) - 이를 총 행수로 균등 분배
  // A4 세로: 297mm - margin 10mm×2 - banner 14mm - thead 10mm = 253mm/page
  const totalRows = execRowsData.reduce((sum, e) => sum + e.projects.length + 1, 0)
  const tbodyMm = 506   // 2페이지 가용 총 높이
  const rowHeightMm = totalRows > 0 ? tbodyMm / totalRows : 8
  // 폰트는 행 높이에 맞게 조정 (행당 최소 1줄 여유)
  const rawFont = rowHeightMm * 2.3   // 1mm ≈ 3.78px, 70% 활용
  const bodyFont = Math.max(7, Math.min(11, rawFont))
  const cellFont = Math.max(6.5, bodyFont - 0.5)
  const headerFont = Math.max(8, Math.min(12, bodyFont + 1))

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
            className="px-5 py-2.5 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--ci-blue)' }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.backgroundColor = 'var(--ci-blue-dark)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue)' }}
          >
            {generating ? '준비 중...' : '인쇄 / PDF 저장'}
          </button>
          <span className="text-xs text-gray-500">인쇄 대화상자에서 <b>방향: 세로</b> 선택</span>
        </div>
      </div>

      <div ref={printRef} className="bg-white print-area" style={{
        // 인쇄 시만 적용될 CSS 변수 (화면에서는 .report-* 기본값 사용)
        ['--print-body-font' as string]: `${bodyFont}px`,
        ['--print-cell-font' as string]: `${cellFont}px`,
        ['--print-header-font' as string]: `${headerFont}px`,
        ['--print-row-h' as string]: `${rowHeightMm}mm`,
      }}>
        {/* 제목만 */}
        <div className="px-2 py-1 border-b border-gray-400 print-no-break">
          <h1 className="font-bold text-gray-800 report-title">■ 임원회의 PROJECT 진행일정표</h1>
        </div>

        <div className="px-2 pt-1">
          <table className="w-full border-collapse report-table" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '34%' }} />  {/* 프로젝트명 (넓게) */}
              {printLabels.map((_, mi) =>
                [0,1,2,3].map(wi => <col key={`${mi}_${wi}`} style={{ width: `${66 / (printMonths * 4)}%` }} />)
              )}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>
                <th className="report-th text-left">프로젝트명</th>
                {printLabels.map((ml, mi) => {
                  const showYear = mi === 0 || (mi > 0 && ml.yearShort !== printLabels[mi - 1].yearShort)
                  return (
                    <th key={mi} colSpan={4} className="report-th text-center">
                      {showYear ? `${ml.yearShort} ` : ''}{ml.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {execRowsData.map(({ exec, projects }) => {
                if (!exec) return null
                const totalCols = 1 + printMonths * 4
                return [
                  <tr key={`band-${exec.id}`} className="exec-band">
                    <td colSpan={totalCols} className="report-td report-band font-bold">
                      ■ {exec.name} ({projects.length}건)
                    </td>
                  </tr>,
                  ...projects.map(project => {
                    const printCells = buildPrintRow(project.weekStatuses, adjustedStart, printMonths)
                    return (
                      <tr key={project.id} className="print-no-break report-row">
                        <td className="report-td report-project align-middle">
                          {project.projectName}
                        </td>
                        {printCells.map((cell, ci) => (
                          <td key={ci} colSpan={cell.colSpan}
                            className="report-td report-cell text-center align-middle"
                            style={{
                              backgroundColor: STATUS_CELL_BG[cell.category],
                              color: STATUS_CELL_TEXT[cell.category],
                            }}>
                            {cell.text && cell.text !== '-' ? cell.text
                              : cell.text === '-' ? <span style={{ color: '#ccc' }}>-</span> : ''}
                          </td>
                        ))}
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        /* 공통 */
        .report-th, .report-td {
          border: 1px solid #6b7280;
          box-sizing: border-box;
          word-break: keep-all;
          overflow-wrap: break-word;
          color: #000;
        }
        .exec-band { break-after: avoid; page-break-after: avoid; }
        .exec-band + tr { break-before: avoid; page-break-before: avoid; }

        /* 화면 보기용 (편안한 크기) */
        .report-title { font-size: 18px; }
        .report-th { padding: 6px 8px; font-size: 13px; font-weight: 600; }
        .report-project { padding: 6px 10px; font-size: 13px; font-weight: 500; }
        .report-cell { padding: 6px 4px; font-size: 12px; font-weight: 500; }
        .report-band td { padding: 6px 10px; font-size: 13px; background: #e5e7eb; font-weight: 700; }
        .report-row { line-height: 1.4; }

        @page { size: A4 portrait; margin: 10mm; }

        /* 인쇄용 */
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-no-break { page-break-inside: avoid; break-inside: avoid; }
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; break-inside: avoid; }

          .report-title { font-size: 13px; }
          .report-th { padding: 2px 3px; font-size: var(--print-header-font); font-weight: 700; }
          .report-project { padding: 1px 3px; font-size: var(--print-body-font); font-weight: 600; line-height: 1.2; }
          .report-cell { padding: 1px 2px; font-size: var(--print-cell-font); font-weight: 500; line-height: 1.2; }
          .report-band td { padding: 1px 5px; font-size: var(--print-body-font); line-height: 1.2; font-weight: 700; }
          .report-row { line-height: 1.2; height: var(--print-row-h); }
          .exec-band { height: var(--print-row-h); }
        }
      `}</style>
    </div>
  )
}
