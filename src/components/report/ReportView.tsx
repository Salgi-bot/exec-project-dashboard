import { useRef, useState, useMemo, useLayoutEffect } from 'react'
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
  const sheet        = useActiveSheet()
  const allProjects  = useFilteredProjects()
  const execOrderMap = useAppStore(s => s.execOrder)
  const printRef  = useRef<HTMLDivElement>(null)
  const table1Ref = useRef<HTMLDivElement>(null)
  const table2Ref = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const [zoom1, setZoom1] = useState(1)
  const [zoom2, setZoom2] = useState(1)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)
  const PRINT_MONTHS = 5
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
    try { generatePDF() } finally { setGenerating(false) }
  }

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

  // 행 수 기준으로 2페이지 균등 분할
  const totalRows = execRowsData.reduce((sum, { projects }) => sum + 1 + projects.length, 0)
  let accumulated = 0
  let splitIdx = execRowsData.length
  for (let i = 0; i < execRowsData.length; i++) {
    accumulated += 1 + execRowsData[i].projects.length
    if (accumulated >= Math.ceil(totalRows / 2)) {
      splitIdx = i + 1
      break
    }
  }
  const page1Execs = execRowsData.slice(0, splitIdx)
  const page2Execs = execRowsData.slice(splitIdx)

  // 각 테이블의 실제 화면 높이 측정 → A4 가용 높이로 zoom 계산
  // @page margin 10mm → 가용 277mm | 페이지1: 제목 8mm 차감 → 269mm
  const P1_TARGET = 269 * 3.78  // ≈ 1017px
  const P2_TARGET = 277 * 3.78  // ≈ 1047px

  // screen CSS(13px font) → print CSS(7.5px font) 렌더 높이 차이 보정계수
  // PDF 실측: screen height 기준 zoom=1 시 약 65% 채워짐 → ×1.5 보정
  const PRINT_SCALE = 3.0

  useLayoutEffect(() => {
    if (table1Ref.current) {
      const h = table1Ref.current.scrollHeight
      if (h > 0) setZoom1(+(Math.min(3, (P1_TARGET / h) * PRINT_SCALE)).toFixed(3))
    }
    if (table2Ref.current) {
      const h = table2Ref.current.scrollHeight
      if (h > 0) setZoom2(+(Math.min(3, (P2_TARGET / h) * PRINT_SCALE)).toFixed(3))
    }
  }, [execRowsData, printMonths])

  // 연도 그룹 (thead 첫 번째 행)
  const yearGroups = useMemo(() => {
    const groups: { year: string; colSpan: number }[] = []
    for (const ml of printLabels) {
      const last = groups[groups.length - 1]
      if (last && last.year === ml.yearShort) {
        last.colSpan += 4
      } else {
        groups.push({ year: ml.yearShort, colSpan: 4 })
      }
    }
    return groups
  }, [printLabels])

  // 각 페이지 테이블 렌더 (일반 함수 — React 컴포넌트 아님)
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
          {/* 연도 행 */}
          <tr style={{ backgroundColor: '#d1d5db', color: '#111827' }}>
            <th className="report-th" />
            {yearGroups.map((g, i) => (
              <th key={i} colSpan={g.colSpan} className="report-th text-center report-year-th">
                20{g.year}년
              </th>
            ))}
          </tr>
          {/* 월 행 */}
          <tr style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>
            <th className="report-th text-left">프로젝트명</th>
            {printLabels.map((ml, mi) => (
              <th key={mi} colSpan={4} className="report-th text-center">
                {ml.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {execs.map(({ exec, projects }) => {
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
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">■ 출력</h2>
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

      {/* 출력 검증 패널 (화면 전용) */}
      <div className="no-print mb-3 grid grid-cols-2 gap-2 text-xs font-mono">
        {[
          { label: '1페이지', zoom: zoom1, target: P1_TARGET },
          { label: '2페이지', zoom: zoom2, target: P2_TARGET },
        ].map(({ label, zoom, target }) => {
          const ok = zoom >= 0.55
          return (
            <div key={label} className={`rounded-lg border px-3 py-2 ${ok ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="font-bold mb-1" style={{ color: ok ? '#166534' : '#991b1b' }}>
                {ok ? '✓' : '✗'} {label}
              </div>
              <div className="text-gray-600 space-y-0.5">
                <div>zoom: <b style={{ color: ok ? '#166534' : '#991b1b' }}>{(zoom * 100).toFixed(1)}%</b></div>
                <div>가용: <b>{(target / 3.78).toFixed(0)}mm</b></div>
                <div>{zoom < 0.55 ? '⚠ 너무 많은 행 — 분할 조정 필요' : zoom === 1 ? '여유 있음' : 'A4 꽉 채움'}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div ref={printRef} className="bg-white print-area">
        {/* 제목 */}
        <div className="px-2 py-1 border-b border-gray-400 print-no-break">
          <h1 className="font-bold text-gray-800 report-title">■ 임원회의 PROJECT 진행일정표</h1>
        </div>

        {/* 1페이지 테이블 — zoom으로 A4 꽉 채움 */}
        <div ref={table1Ref} className="px-2 pt-1 table-section"
          style={{ ['--zoom' as string]: zoom1 }}>
          {renderTable(page1Execs)}
        </div>

        {/* 강제 페이지 브레이크 후 2페이지 테이블 */}
        {page2Execs.length > 0 && (
          <>
            <div className="page-break" />
            <div ref={table2Ref} className="px-2 pt-1 table-section"
              style={{ ['--zoom' as string]: zoom2 }}>
              {renderTable(page2Execs)}
            </div>
          </>
        )}
      </div>

      <style>{`
        .report-th, .report-td {
          border: 1px solid #6b7280;
          box-sizing: border-box;
          word-break: keep-all;
          overflow-wrap: break-word;
          color: #000;
        }
        .exec-band { break-after: avoid; page-break-after: avoid; }
        .exec-band + tr { break-before: avoid; page-break-before: avoid; }

        /* 화면 보기용 */
        .report-title { font-size: 18px; }
        .report-year-th { font-size: 13px; font-weight: 800; }
        .report-th { padding: 6px 8px; font-size: 13px; font-weight: 600; }
        .report-project { padding: 6px 10px; font-size: 13px; font-weight: 500; }
        .report-cell { padding: 6px 4px; font-size: 12px; font-weight: 500; }
        .report-band td { padding: 6px 10px; font-size: 13px; background: #e5e7eb; font-weight: 700; }
        .report-row { line-height: 1.4; }

        @page { size: A4 portrait; margin: 10mm; }

        @media print {
          html, body { margin: 0; padding: 0; background: white; }

          .app-shell { display: block !important; height: auto !important; overflow: visible !important; }
          .app-shell aside { display: none !important; }
          .app-main { display: block !important; overflow: visible !important; }
          main { display: block !important; overflow: visible !important; height: auto !important; background: white !important; }
          .no-print { display: none !important; }

          .print-area { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* 페이지 분할 */
          .page-break { page-break-after: always; break-after: page; height: 0; margin: 0; padding: 0; }

          /* 테이블별 zoom — 2테이블 구조라 thead 반복 문제 없음 */
          .table-section { zoom: var(--zoom, 1); transform-origin: top left; -webkit-print-color-adjust: exact; }

          .print-no-break { page-break-inside: avoid; break-inside: avoid; }
          table { page-break-inside: auto; width: 100% !important; }
          tr { page-break-inside: avoid; break-inside: avoid; }

          .report-title { font-size: 11px; }
          .report-year-th { font-size: 8px; font-weight: 800; }
          .report-th { padding: 2px 3px; font-size: 7.5px; font-weight: 700; }
          .report-project { padding: 1px 3px; font-size: 7px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; }
          .report-cell { padding: 1px 2px; font-size: 7px; font-weight: 500; line-height: 1.2; white-space: nowrap; overflow: hidden; }
          .report-band td { padding: 1px 5px; font-size: 8.5px; line-height: 1.2; font-weight: 700; white-space: nowrap; overflow: hidden; }
          .report-row { line-height: 1.2; }
        }
      `}</style>
    </div>
  )
}
