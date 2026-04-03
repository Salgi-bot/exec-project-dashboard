import * as XLSX from 'xlsx'
import type { Project, SheetData } from '@/types/project.types'
import { EXECUTIVE_MAP } from '@/constants/executives'
import { getMonthLabels } from '@/constants/periods'

export function exportToExcel(
  projects: Project[],
  sheet: SheetData,
  assigneeOverrides: Record<string, string>,
  filename: string,
): void {
  const monthLabels = getMonthLabels(sheet.period)

  // 헤더 행 1: 담당임원 | 담당자 | 프로젝트명 | 발주처 | [월 이름 × 4주]
  const header1 = ['담당임원', '담당자', '프로젝트명', '발주처']
  const header2 = ['', '', '', '']
  for (const ml of monthLabels) {
    header1.push(ml.yearShort + ' ' + ml.label, '', '', '')
    header2.push('1주', '2주', '3주', '4주')
  }

  const rows: (string | number)[][] = [header1, header2]

  for (const project of projects) {
    if (project.isManagerSummaryRow) continue
    const exec = EXECUTIVE_MAP[project.executiveId]
    const assignee = assigneeOverrides[project.id] || exec?.name || ''
    const row: (string | number)[] = [
      exec?.name ?? '',
      assignee,
      project.projectName,
      project.client ?? '',
    ]
    for (let m = 0; m < sheet.period.totalMonths; m++) {
      for (let w = 0; w < 4; w++) {
        const ws = project.weekStatuses.find(s => s.monthIndex === m && s.weekIndex === w)
        row.push(ws?.text ?? '')
      }
    }
    rows.push(row)
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // 열 너비 설정
  ws['!cols'] = [
    { wch: 8 },   // 담당임원
    { wch: 12 },  // 담당자
    { wch: 30 },  // 프로젝트명
    { wch: 16 },  // 발주처
    ...Array(sheet.period.totalMonths * 4).fill({ wch: 10 }),
  ]

  // 월 헤더 병합 (4주씩)
  const merges: XLSX.Range[] = []
  for (let mi = 0; mi < monthLabels.length; mi++) {
    const startCol = 4 + mi * 4
    merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 3 } })
  }
  ws['!merges'] = merges

  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetId)
  XLSX.writeFile(wb, filename)
}
