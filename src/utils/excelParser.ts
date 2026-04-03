import * as XLSX from 'xlsx'
import type { SheetData, SheetId, Project, WeekStatus, SheetPeriod } from '@/types/project.types'
import { SHEET_IDS } from '@/types/project.types'
import { findExecutive, EXECUTIVE_MAP } from '@/constants/executives'
import { classifyStatus } from './statusClassifier'
import { buildPeriodLabel } from '@/constants/periods'

// 열 인덱스(0-based) → {monthIndex, weekIndex}
// 데이터 시작: col index 2 (C열) = monthIndex 0, weekIndex 0
function colIndexToMonthWeek(colIdx: number): { monthIndex: number; weekIndex: number } | null {
  const offset = colIdx - 2
  if (offset < 0 || offset >= 48) return null
  return { monthIndex: Math.floor(offset / 4), weekIndex: offset % 4 }
}

function parseProjectName(raw: string): { projectName: string; client: string } {
  if (!raw) return { projectName: '', client: '' }
  const parts = raw.split('\n')
  const projectName = parts[0].trim()
  const clientMatch = parts.slice(1).join(' ').match(/\(([^)]+)\)/)
  return { projectName, client: clientMatch ? clientMatch[1].trim() : '' }
}

// Excel 헤더에서 시작 연도/월/총 월수 파싱
function parsePeriodFromHeader(
  rawData: (string | null)[][],
  getCellText: (r: number, c: number) => string
): { startYear: number; startMonth: number; totalMonths: number } {
  // Row 1 (index 1): "2025년도", "2026년도" 등의 연도 라벨 → 첫 번째 연도 찾기
  let startYear = new Date().getFullYear()
  const row1 = rawData[1] || []
  for (let c = 0; c < row1.length; c++) {
    const cell = getCellText(1, c)
    if (cell && cell.includes('년도')) {
      const y = parseInt(cell)
      if (!isNaN(y)) { startYear = y; break }
    }
  }

  // Row 2 (index 2): "07월", "08월" 등 월 라벨 → 첫 번째 월 = startMonth
  const firstMonthStr = getCellText(2, 2)  // col C
  const startMonth = parseInt(firstMonthStr) || 7

  // 총 월 수: row 2에서 col C부터 4칸 간격으로 월 라벨이 있는 수 카운트
  let totalMonths = 0
  for (let c = 2; c <= 49; c += 4) {
    const cell = getCellText(2, c)
    if (cell && cell.includes('월')) totalMonths++
  }
  if (totalMonths === 0) totalMonths = 12

  return { startYear, startMonth, totalMonths }
}

function parseSheet(ws: XLSX.WorkSheet, sheetId: SheetId): SheetData {
  const rawData: (string | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1, raw: false, defval: null,
  }) as (string | null)[][]

  // 병합 셀 처리
  interface MergeInfo {
    text: string; startCol: number; endCol: number; isOrigin: boolean
  }
  const mergeMap: Record<string, MergeInfo> = {}
  const merges: XLSX.Range[] = ws['!merges'] || []

  for (const merge of merges) {
    const originCell = ws[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })]
    const originText = originCell ? String(originCell.w ?? originCell.v ?? '') : ''
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        mergeMap[`${r}_${c}`] = {
          text: originText,
          startCol: merge.s.c,
          endCol: merge.e.c,
          isOrigin: (r === merge.s.r && c === merge.s.c),
        }
      }
    }
  }

  function getCellText(r: number, c: number): string {
    const key = `${r}_${c}`
    if (mergeMap[key]) return mergeMap[key].text
    const val = rawData[r]?.[c]
    return val != null ? String(val) : ''
  }

  // Excel 헤더에서 실제 기간 파싱
  const { startYear, startMonth, totalMonths } = parsePeriodFromHeader(rawData, getCellText)
  const maxWeeks = totalMonths * 4

  const period: SheetPeriod = {
    sheetId,
    label: '',
    startYear,
    startMonth,
    totalMonths,
  }
  period.label = buildPeriodLabel(period)

  const projects: Project[] = []
  let currentExecutiveId = ''

  for (let rowIdx = 4; rowIdx < rawData.length; rowIdx++) {
    const colA = getCellText(rowIdx, 0).trim()
    const colB = getCellText(rowIdx, 1).trim()

    if (colA) {
      const exec = findExecutive(colA)
      if (exec) currentExecutiveId = exec.id
    }

    if (!currentExecutiveId) continue
    const isManagerSummaryRow = colA !== '' && colB === '' && !!findExecutive(colA)
    if (colB === '' && !isManagerSummaryRow) continue

    const { projectName: parsedName, client } = parseProjectName(colB)
    // 개별 프로젝트 없이 업무 현황만 있는 임원의 경우 projectName 보완
    const projectName = parsedName || (isManagerSummaryRow ? '업무 현황' : '')

    // 주차 상태 배열 (totalMonths * 4 칸)
    const statusArray: WeekStatus[] = Array.from({ length: maxWeeks }, (_, i) => ({
      monthIndex: Math.floor(i / 4),
      weekIndex: i % 4,
      text: '',
      colSpan: 1,
      category: 'empty' as const,
    }))

    const processedCols = new Set<number>()

    for (let colIdx = 2; colIdx <= 2 + maxWeeks - 1; colIdx++) {
      if (processedCols.has(colIdx)) continue

      const mergeInfo = mergeMap[`${rowIdx}_${colIdx}`]

      if (mergeInfo) {
        if (!mergeInfo.isOrigin) { processedCols.add(colIdx); continue }

        const endCol = Math.min(mergeInfo.endCol, 2 + maxWeeks - 1)
        const totalWeeks = endCol - mergeInfo.startCol + 1
        const text = mergeInfo.text
        const category = classifyStatus(text)

        for (let c = mergeInfo.startCol; c <= endCol; c++) {
          const mw = colIndexToMonthWeek(c)
          if (!mw || mw.monthIndex >= totalMonths) continue
          const idx = mw.monthIndex * 4 + mw.weekIndex
          statusArray[idx] = {
            monthIndex: mw.monthIndex,
            weekIndex: mw.weekIndex,
            text,
            colSpan: (c === mergeInfo.startCol) ? totalWeeks : 0,
            category,
          }
          processedCols.add(c)
        }
      } else {
        const mw = colIndexToMonthWeek(colIdx)
        if (!mw || mw.monthIndex >= totalMonths) continue
        const text = rawData[rowIdx]?.[colIdx] != null ? String(rawData[rowIdx][colIdx]) : ''
        const idx = mw.monthIndex * 4 + mw.weekIndex
        statusArray[idx] = {
          monthIndex: mw.monthIndex, weekIndex: mw.weekIndex,
          text, colSpan: 1, category: classifyStatus(text),
        }
        processedCols.add(colIdx)
      }
    }

    projects.push({
      id: `${sheetId}_${currentExecutiveId}_${rowIdx}`,
      sheetId,
      executiveId: currentExecutiveId,
      name: colB || colA,
      projectName,
      client,
      rowIndex: rowIdx,
      weekStatuses: statusArray,
      isManagerSummaryRow,
    })
  }

  const executiveIds = [...new Set(projects.map(p => p.executiveId))]
  const executives = executiveIds
    .map(id => EXECUTIVE_MAP[id])
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)

  return { sheetId, period, executives, projects }
}

export function parseExcelFile(buffer: ArrayBuffer): Record<SheetId, SheetData> {
  const wb = XLSX.read(buffer, { type: 'array', cellText: false })
  const result: Partial<Record<SheetId, SheetData>> = {}

  for (const sheetName of wb.SheetNames) {
    // 정확히 일치하는 SheetId만 허용 (substring 매칭 금지)
    const sheetId = SHEET_IDS.find(id => sheetName === id)
    if (!sheetId) continue

    const ws = wb.Sheets[sheetName]
    result[sheetId] = parseSheet(ws, sheetId)
  }

  return result as Record<SheetId, SheetData>
}
