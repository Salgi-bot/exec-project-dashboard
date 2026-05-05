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
  pending:      '#4b5563',
  review:       '#4b5563',
  construction: '#4b5563',
  inactive:     '#6b7280',
  empty:        '#000000',
}

// A4 portrait at 96dpi with 10mm margin:
// 210mm × 297mm -> 793.7 × 1122.5 px ; content = 173mm × 277mm -> 653.9 × 1046.9 px
const A4_CONTENT_W_PX = 654
const A4_CONTENT_H_PX = 1047
const PRINT_MONTHS = 5

// 월별 레이아웃 관련 상수
const PROJECT_COL_WIDTH_PCT = 32
const MONTH_COL_WIDTH_PCT = (100 - PROJECT_COL_WIDTH_PCT) / PRINT_MONTHS // 13.6%

// 폰트·높이 (고정값)
const TITLE_H_PX = 36
const MIN_ROW_H_PX = 22
const HEADER_FONT_PX = 11
const YEAR_FONT_PX = 12
const BAND_FONT_PX = 11
const PROJECT_FONT_PX = 10
const CELL_FONT_PX = 9

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
 * - monthIndex × 4 + weekIndex 를 절대 주 인덱스로 환산
 * - 절대 주 범위가 monthIdx의 [mi*4, mi*4+4) 와 겹치면 해당 월에 포함
 * - 동일 월 내 중복 텍스트 제거, 서로 다른 텍스트는 " / " 로 연결
 */
function getMonthlyStatus(
  weekStatuses: WeekStatus[],
  monthIdx: number,
): { text: string; category: StatusCategory } {
  const monthStart = monthIdx * 4
  const monthEnd   = monthStart + 4 // exclusive

  const covers: { abs: number; text: string; category: StatusCategory }[] = []
  for (const ws of weekStatuses) {
    if (ws.colSpan === 0) continue            // 연속 셀의 흔적 (원점 아님)
    if (!ws.text || ws.text === '') continue  // 빈 셀 제외
    const startAbs = ws.monthIndex * 4 + ws.weekIndex
    const endAbs   = startAbs + ws.colSpan    // exclusive
    if (endAbs <= monthStart) continue
    if (startAbs >= monthEnd) continue
    covers.push({ abs: startAbs, text: ws.text, category: ws.category })
  }

  if (covers.length === 0) return { text: '', category: 'empty' }

  // 시작 주 오름차순 정렬 (이후 = 더 최근)
  covers.sort((a, b) => a.abs - b.abs)

  // 동일 문자열 중복 제거 (순서 유지)
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
  const [isGenerating, setIsGenerating] = useState(false)

  const monthLabels = sheet ? getMonthLabels(sheet.period) : []
  const currentMonthIdx = sheet ? getCurrentMonthIndex(sheet.period) : 0
  let adjustedStart = Math.max(0, currentMonthIdx - 3)
  const printEnd = sheet ? Math.min(sheet.period.totalMonths, adjustedStart + PRINT_MONTHS) : 0
  if (printEnd - adjustedStart < PRINT_MONTHS) adjustedStart = Math.max(0, printEnd - PRINT_MONTHS)
  const printMonths = printEnd - adjustedStart
  const printLabels = monthLabels.slice(adjustedStart, adjustedStart + printMonths)

  const printProjects = allProjects.filter(p => {
    if (p.isManagerSummaryRow) return false
    // 출력 범위(adjustedStart ~ adjustedStart+printMonths) 내 content가 하나라도 있는 프로젝트만 포함
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

  // 연도 그룹 (월별 컬럼이므로 colSpan += 1)
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

  // 행 수 기준 2페이지 균등 분할 — 두 페이지 행 차이가 최소가 되는 분할점 탐색
  // 동률 시 1페이지가 더 무겁도록 (일반 문서 관행) → `<=` 비교
  // (임원 밴드 1행 + 프로젝트 n행)
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

  // 페이지별 임원·프로젝트 수 (검증 패널용)
  const p1ExecCount = page1Execs.length
  const p1ProjCount = page1Execs.reduce((s, { projects }) => s + projects.length, 0)
  const p2ExecCount = page2Execs.length
  const p2ProjCount = page2Execs.reduce((s, { projects }) => s + projects.length, 0)

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

  function renderTable(execs: typeof execRowsData, pageNum: number, totalPages: number) {
    const totalCols = 1 + printMonths
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

    return (
      <>
        <div style={{
          height: TITLE_H_PX,
          padding: '4px 8px',
          borderBottom: '1px solid #6b7280',
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
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: `${PROJECT_COL_WIDTH_PCT}%` }} />
            {printLabels.map((_, mi) => (
              <col key={mi} style={{ width: `${MONTH_COL_WIDTH_PCT}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#d1d5db' }}>
              <th
                rowSpan={2}
                style={{
                  ...headerCellStyle(),
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
                    ...headerCellStyle(),
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
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              {printLabels.map((ml, mi) => (
                <th
                  key={mi}
                  style={{
                    ...headerCellStyle(),
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
                <tr key={`band-${exec.id}`} style={{ backgroundColor: '#e5e7eb' }}>
                  <td
                    colSpan={totalCols}
                    style={{
                      ...bodyCellStyle(),
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: BAND_FONT_PX,
                      color: '#111827',
                      paddingLeft: 8,
                      minHeight: MIN_ROW_H_PX,
                    }}
                  >
                    ■ {exec.name} ({projects.length}건)
                  </td>
                </tr>,
                ...projects.map(project => {
                  return (
                    <tr key={project.id}>
                      <td
                        style={{
                          ...bodyCellStyle(),
                          fontSize: PROJECT_FONT_PX,
                          fontWeight: 600,
                          color: '#000',
                          textAlign: 'left',
                          paddingLeft: 6,
                          whiteSpace: 'normal',
                          overflow: 'visible',
                          wordBreak: 'break-word',
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
                              ...bodyCellStyle(),
                              backgroundColor: STATUS_CELL_BG[category],
                              color: STATUS_CELL_TEXT[category],
                              textAlign: 'center',
                              fontSize: CELL_FONT_PX,
                              fontWeight: 500,
                              whiteSpace: 'normal',
                              overflow: 'visible',
                              wordBreak: 'break-word',
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
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </>
    )
  }

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

      {/* 화면 미리보기 */}
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
          {renderTable(page1Execs, 1, page2Execs.length > 0 ? 2 : 1)}
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
            {renderTable(page2Execs, 2, 2)}
          </div>
        )}
      </div>
    </div>
  )
}

function headerCellStyle(): React.CSSProperties {
  return {
    border: '1px solid #6b7280',
    boxSizing: 'border-box',
    padding: '4px 3px',
    lineHeight: 1.2,
    verticalAlign: 'middle',
    minHeight: MIN_ROW_H_PX,
  }
}

function bodyCellStyle(): React.CSSProperties {
  return {
    border: '1px solid #6b7280',
    boxSizing: 'border-box',
    padding: '3px 4px',
    lineHeight: 1.25,
    verticalAlign: 'middle',
    minHeight: MIN_ROW_H_PX,
  }
}
