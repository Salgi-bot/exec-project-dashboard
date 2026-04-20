import { useRef, useMemo } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { getMonthLabels } from '@/constants/periods'
import { classifyStatus } from '@/utils/statusClassifier'
import { generatePDF } from '@/utils/pdfExporter'
import type { StatusCategory, WeekStatus, SheetPeriod } from '@/types/project.types'

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
    pushEmpty(cellStart - pos)
    const cat = ws.text ? classifyStatus(ws.text) : 'empty'
    result.push({ text: ws.text, colSpan: cellEnd - cellStart, category: cat })
    pos = cellEnd
  }
  pushEmpty(endAbs - pos)
  return result
}

export function ReportView() {
  const sheet        = useActiveSheet()
  const allProjects  = useFilteredProjects()
  const execOrderMap = useAppStore(s => s.execOrder)
  const printRef     = useRef<HTMLDivElement>(null)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)
  const PRINT_MONTHS = 5
  const currentMonthIdx = getCurrentMonthIndex(sheet.period)
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  let printEnd = Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS)
  if (printEnd - adjustedStart < PRINT_MONTHS) adjustedStart = Math.max(0, printEnd - PRINT_MONTHS)
  const printMonths = printEnd - adjustedStart
  const printLabels = monthLabels.slice(adjustedStart, adjustedStart + printMonths)

  const printProjects = allProjects.filter(p => !p.isManagerSummaryRow)
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

  const execRowsData = useMemo(() => {
    return orderedExecs.map(exec => {
      if (!exec) return null
      const projects = grouped.get(exec.id) ?? []
      return { exec, projects }
    }).filter(Boolean) as { exec: typeof orderedExecs[0]; projects: typeof printProjects }[]
  }, [orderedExecs, grouped])

  // 행 수 기준 2페이지 균등 분할
  const totalRows = execRowsData.reduce((sum, { projects }) => sum + 1 + projects.length, 0)
  let accumulated = 0
  let splitIdx = execRowsData.length
  for (let i = 0; i < execRowsData.length; i++) {
    accumulated += 1 + execRowsData[i].projects.length
    if (accumulated >= Math.ceil(totalRows / 2)) { splitIdx = i + 1; break }
  }
  const page1Execs = execRowsData.slice(0, splitIdx)
  const page2Execs = execRowsData.slice(splitIdx)

  // ── mm 단위 직접 계산 (screen 측정 없음) ──────────────────────────
  // @page margin: 10mm → A4 가용 277mm
  // 1페이지: 제목 영역 약 7mm 차감 → 270mm
  const P1_MM = 270
  const P2_MM = 277

  // thead 2행 포함한 전체 행 수
  const p1Rows = page1Execs.reduce((sum, { projects }) => sum + 1 + projects.length, 0) + 2
  const p2Rows = page2Execs.length > 0
    ? page2Execs.reduce((sum, { projects }) => sum + 1 + projects.length, 0) + 2
    : 1

  // 행 높이 (mm) = 가용 높이 ÷ 행 수
  const rowH1 = +(P1_MM / p1Rows).toFixed(2)
  const rowH2 = +(P2_MM / p2Rows).toFixed(2)

  const yearGroups = useMemo(() => {
    const groups: { year: string; colSpan: number }[] = []
    for (const ml of printLabels) {
      const last = groups[groups.length - 1]
      if (last && last.year === ml.yearShort) last.colSpan += 4
      else groups.push({ year: ml.yearShort, colSpan: 4 })
    }
    return groups
  }, [printLabels])

  function renderTable(execs: typeof execRowsData) {
    return (
      <table className="w-full border-collapse report-table" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '34%' }} />
          {printLabels.map((_, mi) =>
            [0,1,2,3].map(wi => <col key={`${mi}_${wi}`} style={{ width: `${66 / (printMonths * 4)}%` }} />)
          )}
        </colgroup>
        <thead>
          <tr className="report-thead-year" style={{ backgroundColor: '#d1d5db', color: '#111827' }}>
            <th className="report-th" />
            {yearGroups.map((g, i) => (
              <th key={i} colSpan={g.colSpan} className="report-th text-center report-year-th">
                20{g.year}년
              </th>
            ))}
          </tr>
          <tr className="report-thead-month" style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>
            <th className="report-th text-left">프로젝트명</th>
            {printLabels.map((ml, mi) => (
              <th key={mi} colSpan={4} className="report-th text-center">{ml.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {execs.map(({ exec, projects }) => {
            if (!exec) return null
            const totalCols = 1 + printMonths * 4
            return [
              <tr key={`band-${exec.id}`} className="exec-band report-row">
                <td colSpan={totalCols} className="report-td report-band font-bold">
                  ■ {exec.name} ({projects.length}건)
                </td>
              </tr>,
              ...projects.map(project => {
                const printCells = buildPrintRow(project.weekStatuses, adjustedStart, printMonths)
                return (
                  <tr key={project.id} className="report-row">
                    <td className="report-td report-project align-middle">{project.projectName}</td>
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
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">■ 출력</h2>
          <p className="text-gray-500 text-sm mt-1">
            {sheet.period.label} | {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length-1]?.yearShort} {printLabels[printLabels.length-1]?.label}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={() => generatePDF()}
            className="px-5 py-2.5 text-white rounded-lg font-medium"
            style={{ backgroundColor: 'var(--ci-blue)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue-dark)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue)' }}>
            인쇄 / PDF 저장
          </button>
          <span className="text-xs text-gray-500">인쇄 대화상자에서 <b>방향: 세로</b> 선택</span>
        </div>
      </div>

      {/* 검증 패널 */}
      <div className="no-print mb-3 grid grid-cols-2 gap-2 text-xs font-mono">
        {([
          { label: '1페이지', rowH: rowH1, rows: p1Rows, targetMm: P1_MM },
          { label: '2페이지', rowH: rowH2, rows: p2Rows, targetMm: P2_MM },
        ] as const).map(({ label, rowH, rows, targetMm }) => (
          <div key={label} className="rounded-lg border border-green-300 bg-green-50 px-3 py-2">
            <div className="font-bold mb-1 text-green-800">✓ {label}</div>
            <div className="text-gray-600 space-y-0.5">
              <div>행수: <b>{rows}행</b> | 행높이: <b>{rowH}mm</b></div>
              <div>가용: <b>{targetMm}mm</b> | 합계: <b>{(rowH * rows).toFixed(1)}mm</b></div>
            </div>
          </div>
        ))}
      </div>

      <div ref={printRef} className="bg-white print-area">
        <div className="px-2 py-1 border-b border-gray-400">
          <h1 className="font-bold text-gray-800 report-title">■ 임원회의 PROJECT 진행일정표</h1>
        </div>

        {/* 1페이지: --row-h를 mm 단위로 전달 */}
        <div className="px-2 table-section" style={{ ['--row-h' as string]: `${rowH1}mm` }}>
          {renderTable(page1Execs)}
        </div>

        {page2Execs.length > 0 && (
          <>
            <div className="page-break" />
            <div className="px-2 table-section" style={{ ['--row-h' as string]: `${rowH2}mm` }}>
              {renderTable(page2Execs)}
            </div>
          </>
        )}
      </div>

      <style>{`
        .report-th, .report-td {
          border: 1px solid #6b7280;
          box-sizing: border-box;
          color: #000;
        }
        .exec-band { break-after: avoid; page-break-after: avoid; }
        .exec-band + tr { break-before: avoid; page-break-before: avoid; }

        /* 화면 */
        .report-title { font-size: 18px; }
        .report-year-th { font-size: 13px; font-weight: 800; }
        .report-th { padding: 6px 8px; font-size: 13px; font-weight: 600; }
        .report-project { padding: 6px 10px; font-size: 13px; font-weight: 500; word-break: keep-all; }
        .report-cell { padding: 6px 4px; font-size: 12px; font-weight: 500; }
        .report-band td { padding: 6px 10px; font-size: 13px; background: #e5e7eb; font-weight: 700; }
        .report-row { line-height: 1.4; }

        @page { size: A4 portrait; margin: 10mm; }

        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          .app-shell { display: block !important; height: auto !important; overflow: visible !important; }
          .app-main { display: block !important; overflow: visible !important; }
          main { display: block !important; overflow: visible !important; height: auto !important; background: white !important; }
          .no-print { display: none !important; }
          .print-area { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-after: always; break-after: page; height: 0; margin: 0; padding: 0; }

          /* mm 단위 행 높이: tr에 지정 (td보다 안정적) */
          .table-section .report-row { height: var(--row-h, 9mm); }
          .table-section .report-thead-year { height: var(--row-h, 9mm); }
          .table-section .report-thead-month { height: var(--row-h, 9mm); }

          .report-title { font-size: 3mm; }
          .report-year-th {
            font-size: calc(var(--row-h, 9mm) * 0.42);
            font-weight: 800;
          }
          .report-th {
            padding: calc(var(--row-h, 9mm) * 0.15) 2px;
            font-size: calc(var(--row-h, 9mm) * 0.38);
            font-weight: 700;
            line-height: 1.0;
            overflow: hidden;
            white-space: nowrap;
          }
          .report-project {
            padding: calc(var(--row-h, 9mm) * 0.15) 2px;
            font-size: calc(var(--row-h, 9mm) * 0.42);
            font-weight: 600;
            line-height: 1.0;
            overflow: hidden;
            white-space: nowrap;
          }
          .report-cell {
            padding: calc(var(--row-h, 9mm) * 0.15) 1px;
            font-size: calc(var(--row-h, 9mm) * 0.38);
            font-weight: 500;
            line-height: 1.0;
            overflow: hidden;
            white-space: nowrap;
          }
          .report-band td {
            padding: calc(var(--row-h, 9mm) * 0.10) 3px;
            font-size: calc(var(--row-h, 9mm) * 0.55);
            font-weight: 700;
            line-height: 1.0;
            overflow: hidden;
            white-space: nowrap;
          }
          .report-row { line-height: 1.0; }
          table { width: 100% !important; border-collapse: collapse; }
        }
      `}</style>
    </div>
  )
}
