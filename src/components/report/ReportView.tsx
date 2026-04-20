import { useRef, useMemo, useState } from 'react'
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

// A4 portrait at 96dpi with 10mm margin:
// 210mm × 297mm -> 793.7 × 1122.5 px ; content = 173mm × 277mm -> 653.9 × 1046.9 px
const A4_CONTENT_W_PX = 654
const A4_CONTENT_H_PX = 1047

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
  const page1Ref     = useRef<HTMLDivElement>(null)
  const page2Ref     = useRef<HTMLDivElement>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  const monthLabels = getMonthLabels(sheet.period)
  const PRINT_MONTHS = 5
  const currentMonthIdx = getCurrentMonthIndex(sheet.period)
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  const printEnd = Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS)
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

  // thead 2행 포함한 전체 행 수
  const p1Rows = page1Execs.reduce((sum, { projects }) => sum + 1 + projects.length, 0) + 2
  const p2Rows = page2Execs.length > 0
    ? page2Execs.reduce((sum, { projects }) => sum + 1 + projects.length, 0) + 2
    : 1

  const yearGroups = useMemo(() => {
    const groups: { year: string; colSpan: number }[] = []
    for (const ml of printLabels) {
      const last = groups[groups.length - 1]
      if (last && last.year === ml.yearShort) last.colSpan += 4
      else groups.push({ year: ml.yearShort, colSpan: 4 })
    }
    return groups
  }, [printLabels])

  async function handleGeneratePDF() {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      await generatePDF(page1Ref.current, page2Execs.length > 0 ? page2Ref.current : null)
    } catch (err) {
      console.error('[ReportView] PDF 생성 실패:', err)
      alert('PDF 생성 중 오류가 발생했습니다. 콘솔을 확인하세요.')
    } finally {
      setIsGenerating(false)
    }
  }

  function renderTable(execs: typeof execRowsData, rowHeightPx: number, withTitle: boolean) {
    const titleH = withTitle ? 36 : 0
    const tableFontSize = Math.max(8, Math.floor(rowHeightPx * 0.38))
    const projectFontSize = Math.max(9, Math.floor(rowHeightPx * 0.42))
    const bandFontSize = Math.max(10, Math.floor(rowHeightPx * 0.52))
    const yearFontSize = Math.max(10, Math.floor(rowHeightPx * 0.44))

    return (
      <>
        {withTitle && (
          <div style={{
            height: titleH,
            padding: '4px 8px',
            borderBottom: '1px solid #6b7280',
            display: 'flex',
            alignItems: 'center',
          }}>
            <h1 style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: '#1f2937',
            }}>
              ■ 임원회의 PROJECT 진행일정표
            </h1>
          </div>
        )}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: '34%' }} />
            {printLabels.map((_, mi) =>
              [0, 1, 2, 3].map(wi => (
                <col key={`${mi}_${wi}`} style={{ width: `${66 / (printMonths * 4)}%` }} />
              ))
            )}
          </colgroup>
          <thead>
            <tr style={{ height: rowHeightPx, backgroundColor: '#d1d5db' }}>
              <th style={cellBaseStyle(rowHeightPx)} />
              {yearGroups.map((g, i) => (
                <th
                  key={i}
                  colSpan={g.colSpan}
                  style={{
                    ...cellBaseStyle(rowHeightPx),
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: yearFontSize,
                    color: '#111827',
                  }}
                >
                  20{g.year}년
                </th>
              ))}
            </tr>
            <tr style={{ height: rowHeightPx, backgroundColor: '#f3f4f6' }}>
              <th
                style={{
                  ...cellBaseStyle(rowHeightPx),
                  textAlign: 'left',
                  fontWeight: 700,
                  fontSize: tableFontSize,
                  color: '#1f2937',
                }}
              >
                프로젝트명
              </th>
              {printLabels.map((ml, mi) => (
                <th
                  key={mi}
                  colSpan={4}
                  style={{
                    ...cellBaseStyle(rowHeightPx),
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: tableFontSize,
                    color: '#1f2937',
                  }}
                >
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
                <tr key={`band-${exec.id}`} style={{ height: rowHeightPx, backgroundColor: '#e5e7eb' }}>
                  <td
                    colSpan={totalCols}
                    style={{
                      ...cellBaseStyle(rowHeightPx),
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: bandFontSize,
                      color: '#111827',
                      paddingLeft: 8,
                    }}
                  >
                    ■ {exec.name} ({projects.length}건)
                  </td>
                </tr>,
                ...projects.map(project => {
                  const printCells = buildPrintRow(project.weekStatuses, adjustedStart, printMonths)
                  return (
                    <tr key={project.id} style={{ height: rowHeightPx }}>
                      <td
                        style={{
                          ...cellBaseStyle(rowHeightPx),
                          fontSize: projectFontSize,
                          fontWeight: 600,
                          color: '#000',
                          textAlign: 'left',
                          paddingLeft: 6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {project.projectName}
                      </td>
                      {printCells.map((cell, ci) => (
                        <td
                          key={ci}
                          colSpan={cell.colSpan}
                          style={{
                            ...cellBaseStyle(rowHeightPx),
                            backgroundColor: STATUS_CELL_BG[cell.category],
                            color: STATUS_CELL_TEXT[cell.category],
                            textAlign: 'center',
                            fontSize: tableFontSize,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cell.text && cell.text !== '-'
                            ? cell.text
                            : cell.text === '-'
                            ? <span style={{ color: '#ccc' }}>-</span>
                            : ''}
                        </td>
                      ))}
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </>
    )
  }

  // Row heights for capture (px) — fit A4 content area
  const p1AvailH = A4_CONTENT_H_PX - 36 // minus title
  const rowH1Px = Math.floor(p1AvailH / p1Rows)
  const rowH2Px = page2Execs.length > 0 ? Math.floor(A4_CONTENT_H_PX / p2Rows) : 0

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">■ 출력</h2>
          <p className="text-gray-500 text-sm mt-1">
            {sheet.period.label} | {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length - 1]?.yearShort} {printLabels[printLabels.length - 1]?.label}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="px-5 py-2.5 text-white rounded-lg font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--ci-blue)' }}
            onMouseEnter={e => { if (!isGenerating) e.currentTarget.style.backgroundColor = 'var(--ci-blue-dark)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue)' }}
          >
            {isGenerating ? '생성 중...' : 'PDF 저장'}
          </button>
          <span className="text-xs text-gray-500">A4 세로 · 2페이지 고정</span>
        </div>
      </div>

      {/* 검증 패널 */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs font-mono">
        {([
          { label: '1페이지', rowHPx: rowH1Px, rows: p1Rows },
          { label: '2페이지', rowHPx: rowH2Px, rows: p2Rows },
        ] as const).map(({ label, rowHPx, rows }) => (
          <div key={label} className="rounded-lg border border-green-300 bg-green-50 px-3 py-2">
            <div className="font-bold mb-1 text-green-800">✓ {label}</div>
            <div className="text-gray-600 space-y-0.5">
              <div>행수: <b>{rows}행</b> | 행높이: <b>{rowHPx}px</b></div>
              <div>합계: <b>{rowHPx * rows}px</b> / {A4_CONTENT_H_PX}px</div>
            </div>
          </div>
        ))}
      </div>

      {/* 화면 미리보기 (축소) */}
      <div className="mb-4 text-xs text-gray-500">아래 미리보기는 실제 PDF 출력과 동일한 레이아웃입니다.</div>

      {/* 캡처 대상: 항상 A4 크기로 고정 렌더 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div
          ref={page1Ref}
          style={{
            width: A4_CONTENT_W_PX,
            height: A4_CONTENT_H_PX,
            backgroundColor: '#ffffff',
            boxShadow: '0 0 8px rgba(0,0,0,0.1)',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {renderTable(page1Execs, rowH1Px, true)}
        </div>

        {page2Execs.length > 0 && (
          <div
            ref={page2Ref}
            style={{
              width: A4_CONTENT_W_PX,
              height: A4_CONTENT_H_PX,
              backgroundColor: '#ffffff',
              boxShadow: '0 0 8px rgba(0,0,0,0.1)',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {renderTable(page2Execs, rowH2Px, false)}
          </div>
        )}
      </div>
    </div>
  )
}

function cellBaseStyle(rowH: number): React.CSSProperties {
  return {
    border: '1px solid #6b7280',
    boxSizing: 'border-box',
    padding: `${Math.max(1, Math.floor(rowH * 0.12))}px 3px`,
    lineHeight: 1.1,
    verticalAlign: 'middle',
  }
}
