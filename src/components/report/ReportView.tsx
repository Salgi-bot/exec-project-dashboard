import { useRef, useMemo } from 'react'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { useAppStore } from '@/store/appStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { getMonthLabels } from '@/constants/periods'
import { classifyStatus } from '@/utils/statusClassifier'
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
  pending:      '#4b5563',
  review:       '#4b5563',
  construction: '#4b5563',
  inactive:     '#6b7280',
  empty:        '#000000',
}

// A4 portrait at 96dpi with 10mm margin:
// 210mm × 297mm -> content 190mm × 277mm -> 718.1 × 1046.9 px
const A4_CONTENT_W_PX = 720
const A4_CONTENT_H_PX = 1047
const PRINT_MONTHS = 6

const PROJECT_COL_WIDTH_PCT = 25
const MONTH_COL_WIDTH_PCT = (100 - PROJECT_COL_WIDTH_PCT) / PRINT_MONTHS // 12.5%

const TITLE_H_PX = 36
const MIN_ROW_H_PX = 22
const HEADER_FONT_PX = 11
const YEAR_FONT_PX = 12
const BAND_FONT_PX = 11
const PROJECT_FONT_PX = 10
const CELL_FONT_PX = 9

// 모든 셀 동일한 4방향 보더 (collapse가 인접 셀 보더 합쳐 1px 단일 라인 보장)
const CELL_BORDER = '1px solid #374151'
const PRINT_FONT_FAMILY = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif"

const headerCellStyle: React.CSSProperties = {
  border: CELL_BORDER,
  boxSizing: 'border-box',
  padding: '4px 3px',
  lineHeight: 1.2,
  verticalAlign: 'middle',
}

const bodyCellStyle: React.CSSProperties = {
  border: CELL_BORDER,
  boxSizing: 'border-box',
  padding: '3px 4px',
  lineHeight: 1.25,
  verticalAlign: 'middle',
}

const cellTextWrap: React.CSSProperties = {
  whiteSpace: 'normal',
  overflow: 'visible',
  wordBreak: 'break-word',
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

/**
 * 주어진 sheet-relative monthIndex에 해당하는 월별 상태 텍스트를 추출.
 * - weekStatuses의 colSpan은 "주" 단위 (4주 = 1개월)
 * - 절대 주 범위가 monthIdx의 [mi*4, mi*4+4) 와 겹치면 해당 월에 포함
 * - 동일 월 내 중복 텍스트 제거, 서로 다른 텍스트는 " / " 로 연결
 */
function getMonthlyStatus(
  weekStatuses: WeekStatus[],
  monthIdx: number,
): { text: string; category: StatusCategory } {
  const monthStart = monthIdx * 4
  const monthEnd   = monthStart + 4

  const covers: { abs: number; text: string; category: StatusCategory }[] = []
  for (const ws of weekStatuses) {
    if (ws.colSpan === 0) continue
    if (!ws.text || ws.text === '') continue
    const startAbs = ws.monthIndex * 4 + ws.weekIndex
    const endAbs   = startAbs + ws.colSpan
    if (endAbs <= monthStart) continue
    if (startAbs >= monthEnd) continue
    covers.push({ abs: startAbs, text: ws.text, category: ws.category })
  }

  if (covers.length === 0) return { text: '', category: 'empty' }

  covers.sort((a, b) => a.abs - b.abs)

  const seen = new Set<string>()
  const uniqTexts: string[] = []
  for (const c of covers) {
    if (seen.has(c.text)) continue
    seen.add(c.text)
    uniqTexts.push(c.text)
  }

  const text = uniqTexts.join(' / ')
  const category = classifyStatus(text)
  return { text, category }
}

export function ReportView() {
  const sheet        = useActiveSheet()
  const allProjects  = useFilteredProjects()
  const execOrderMap = useAppStore(s => s.execOrder)
  const page1Ref     = useRef<HTMLDivElement>(null)
  const page2Ref     = useRef<HTMLDivElement>(null)

  const monthLabels = sheet ? getMonthLabels(sheet.period) : []
  const currentMonthIdx = sheet ? getCurrentMonthIndex(sheet.period) : 0
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  const printEnd = sheet ? Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS) : 0
  if (printEnd - adjustedStart < PRINT_MONTHS) adjustedStart = Math.max(0, printEnd - PRINT_MONTHS)
  const printMonths = printEnd - adjustedStart
  const printLabels = monthLabels.slice(adjustedStart, adjustedStart + printMonths)

  const printProjects = allProjects.filter(p => {
    if (p.isManagerSummaryRow) return false
    for (let slotIdx = 0; slotIdx < printMonths; slotIdx++) {
      const sheetMonthIdx = adjustedStart + slotIdx
      const { text } = getMonthlyStatus(p.weekStatuses, sheetMonthIdx)
      if (text && text !== '-') return true
    }
    return false
  })
  const execOrder = sheet ? (execOrderMap[sheet.sheetId] ?? []) : []

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
    if (!sheet) return []
    const allExecs = sheet.executives
    const ordered = execOrder.length
      ? execOrder.map(id => allExecs.find(e => e.id === id)).filter(e => !!e && grouped.has(e!.id))
      : allExecs.filter(e => grouped.has(e.id))
    allExecs.forEach(e => {
      if (!ordered.find(x => x?.id === e.id) && grouped.has(e.id)) ordered.push(e)
    })
    return ordered.filter(Boolean)
  }, [sheet, execOrder, grouped])

  const execRowsData = useMemo(() => {
    return orderedExecs.map(exec => {
      if (!exec) return null
      const projects = grouped.get(exec.id) ?? []
      return { exec, projects }
    }).filter(Boolean) as { exec: typeof orderedExecs[0]; projects: typeof printProjects }[]
  }, [orderedExecs, grouped])

  const yearGroups = useMemo(() => {
    const groups: { year: string; colSpan: number }[] = []
    for (const ml of printLabels) {
      const last = groups[groups.length - 1]
      if (last && last.year === ml.yearShort) last.colSpan += 1
      else groups.push({ year: ml.yearShort, colSpan: 1 })
    }
    return groups
  }, [printLabels])

  if (!sheet) return <div className="p-8"><EmptyState /></div>

  // 행 차이 최소화 + 동률 시 1페이지 우선 (`<=`)
  const totalRows = execRowsData.reduce((sum, { projects }) => sum + 1 + projects.length, 0)
  let bestSplit = execRowsData.length
  let bestDiff = Infinity
  let cumulative = 0
  for (let i = 0; i < execRowsData.length; i++) {
    cumulative += 1 + execRowsData[i].projects.length
    const remaining = totalRows - cumulative
    const diff = Math.abs(cumulative - remaining)
    if (diff <= bestDiff) {
      bestDiff = diff
      bestSplit = i + 1
    }
  }
  const splitIdx = bestSplit
  const page1Execs = execRowsData.slice(0, splitIdx)
  const page2Execs = execRowsData.slice(splitIdx)

  const p1ExecCount = page1Execs.length
  const p1ProjCount = page1Execs.reduce((s, { projects }) => s + projects.length, 0)
  const p2ExecCount = page2Execs.length
  const p2ProjCount = page2Execs.reduce((s, { projects }) => s + projects.length, 0)
  const totalPages = page2Execs.length > 0 ? 2 : 1

  function handlePrint() {
    window.print()
  }

  function renderPageHeader(pageNum: number) {
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
    return (
      <div style={{
        height: TITLE_H_PX,
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 700,
          color: '#1f2937',
        }}>
          ■ 임원회의 PROJECT 진행일정표
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#6b7280' }}>출력일자: {dateStr}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#374151',
            padding: '2px 8px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            backgroundColor: '#f9fafb',
          }}>
            {pageNum} / {totalPages}
          </span>
        </div>
      </div>
    )
  }

  function renderTable(execs: typeof execRowsData) {
    const totalCols = 1 + printMonths
    return (
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        border: CELL_BORDER,
        boxSizing: 'border-box',
      }}>
        <colgroup>
          <col style={{ width: `${PROJECT_COL_WIDTH_PCT}%` }} />
          {printLabels.map((_, mi) => (
            <col key={mi} style={{ width: `${MONTH_COL_WIDTH_PCT}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: '#d1d5db', height: MIN_ROW_H_PX }}>
            <th
              rowSpan={2}
              style={{
                ...headerCellStyle,
                textAlign: 'left',
                fontWeight: 700,
                fontSize: HEADER_FONT_PX,
                color: '#1f2937',
                backgroundColor: '#f3f4f6',
                paddingLeft: 6,
              }}
            >
              프로젝트명 / 담당임원
            </th>
            {yearGroups.map((g, i) => (
              <th
                key={i}
                colSpan={g.colSpan}
                style={{
                  ...headerCellStyle,
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: YEAR_FONT_PX,
                  color: '#111827',
                }}
              >
                {g.year}
              </th>
            ))}
          </tr>
          <tr style={{ backgroundColor: '#f3f4f6', height: MIN_ROW_H_PX }}>
            {printLabels.map((ml, mi) => (
              <th
                key={mi}
                style={{
                  ...headerCellStyle,
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: HEADER_FONT_PX,
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
            return [
              <tr key={`band-${exec.id}`} style={{ backgroundColor: '#e5e7eb', height: MIN_ROW_H_PX }}>
                <td
                  colSpan={totalCols}
                  style={{
                    ...bodyCellStyle,
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: BAND_FONT_PX,
                    color: '#111827',
                    paddingLeft: 8,
                  }}
                >
                  ■ {exec.name} ({projects.length}건)
                </td>
              </tr>,
              ...projects.map(project => (
                <tr key={project.id}>
                  <td
                    style={{
                      ...bodyCellStyle,
                      ...cellTextWrap,
                      fontSize: PROJECT_FONT_PX,
                      fontWeight: 600,
                      color: '#000',
                      textAlign: 'left',
                      paddingLeft: 6,
                    }}
                  >
                    {project.projectName}
                  </td>
                  {printLabels.map((_, slotIdx) => {
                    const sheetMonthIdx = adjustedStart + slotIdx
                    const { text, category } = getMonthlyStatus(project.weekStatuses, sheetMonthIdx)
                    return (
                      <td
                        key={slotIdx}
                        style={{
                          ...bodyCellStyle,
                          ...cellTextWrap,
                          backgroundColor: STATUS_CELL_BG[category],
                          color: STATUS_CELL_TEXT[category],
                          textAlign: 'center',
                          fontSize: CELL_FONT_PX,
                          fontWeight: 500,
                        }}
                      >
                        {text && text !== '-'
                          ? text
                          : text === '-'
                          ? <span style={{ color: '#ccc' }}>-</span>
                          : ''}
                      </td>
                    )
                  })}
                </tr>
              )),
            ]
          })}
        </tbody>
      </table>
    )
  }

  const pageStyle: React.CSSProperties = {
    width: A4_CONTENT_W_PX,
    height: A4_CONTENT_H_PX,
    backgroundColor: '#ffffff',
    boxShadow: '0 0 8px rgba(0,0,0,0.1)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    fontFamily: PRINT_FONT_FAMILY,
  }

  return (
    <div className="p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">■ 출력</h2>
          <p className="text-gray-500 text-sm mt-1">
            {sheet.period.label} | {printLabels[0]?.yearShort} {printLabels[0]?.label} ~ {printLabels[printLabels.length - 1]?.yearShort} {printLabels[printLabels.length - 1]?.label}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 text-white rounded-lg font-medium"
            style={{ backgroundColor: 'var(--ci-blue)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue-dark)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--ci-blue)' }}
          >
            프린터로 출력
          </button>
          <span className="text-xs text-gray-500">브라우저 인쇄 다이얼로그 → 프린터 또는 PDF 선택</span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs font-mono no-print">
        <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2">
          <div className="font-bold mb-1 text-green-800">✓ 1페이지</div>
          <div className="text-gray-600">
            {p1ExecCount}개 임원, {p1ProjCount}건 프로젝트
          </div>
        </div>
        <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2">
          <div className="font-bold mb-1 text-green-800">✓ 2페이지</div>
          <div className="text-gray-600">
            {p2ExecCount}개 임원, {p2ProjCount}건 프로젝트
          </div>
        </div>
      </div>

      <div className="mb-4 text-xs text-gray-500 no-print">아래 미리보기는 실제 인쇄물과 동일한 레이아웃입니다.</div>

      <div
        className="a4-pages-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div ref={page1Ref} className="a4-page" style={pageStyle}>
          {renderPageHeader(1)}
          {renderTable(page1Execs)}
        </div>

        {page2Execs.length > 0 && (
          <div ref={page2Ref} className="a4-page" style={pageStyle}>
            {renderPageHeader(2)}
            {renderTable(page2Execs)}
          </div>
        )}
      </div>
    </div>
  )
}
