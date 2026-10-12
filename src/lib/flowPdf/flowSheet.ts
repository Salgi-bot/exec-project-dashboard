// 본체 출력(ReportView)이 그린 A4 시트를 복제해 "행 단위 블록"으로 다시 짠다.
//
// 본체 인쇄는 임원 섹션(.exec-section) 전체를 break-inside:avoid 로 묶어, 큰 섹션이
// 남은 칸에 안 들어가면 통째로 다음 쪽으로 넘긴다 → 아이패드에선 쪽마다 큰 빈칸(7쪽).
// 여기서는 각 행을 자기 표로 감싼 블록 div 로 만든다. WebKit 은 <tr> 의 break-inside 는
// 무시하지만 블록 div 의 break-inside:avoid 는 지킨다(본체 75.pdf·아이패드 PDF 실측) →
// 쪽은 빈칸 없이 이어 채우되, 한 행이 쪽 경계에서 반으로 잘리지는 않는다.
// 임원 제목줄은 첫 행과 한 블록으로 묶어 쪽 맨 아래에 홀로 남지 않게 한다.
// 데이터 계산은 전부 ReportView 가 한 결과를 그대로 쓰므로 본체 출력과 내용이 같다.
export function buildFlowSheet(source: HTMLElement): { sheet: HTMLElement; execCount: number; rowCount: number } {
  const page = source.querySelector<HTMLElement>('.a4-page')
  if (!page) throw new Error('출력 시트를 찾지 못했습니다')

  const sheet = document.createElement('div')
  sheet.className = 'flow-sheet'
  sheet.setAttribute('style', page.getAttribute('style') ?? '')

  const header = page.querySelector('.report-header')
  if (header) {
    const head = header.cloneNode(true) as HTMLElement
    head.className = 'flow-block flow-head'
    sheet.append(head)
  }

  let execCount = 0
  let rowCount = 0
  page.querySelectorAll('.exec-section').forEach(section => {
    const table = section.querySelector('table')
    const colgroup = table?.querySelector('colgroup')
    if (!table || !colgroup) return
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'))
    if (rows.length === 0) return
    execCount += 1
    rowCount += rows.length - 1 // 첫 줄은 임원 제목줄

    // 임원 하나 = .flow-sec 하나(PDF 생성 시 이 단위로 캡처한다)
    const sec = document.createElement('div')
    sec.className = 'flow-sec'
    sheet.append(sec)

    const groups = rows.length > 1 ? [rows.slice(0, 2), ...rows.slice(2).map(r => [r])] : [rows]
    groups.forEach((group, i) => {
      const block = document.createElement('div')
      block.className = i === 0 ? 'flow-block flow-sec-start' : 'flow-block'
      // 같은 임원 안의 행 블록은 위 테두리를 1px 겹쳐 본체 표처럼 한 줄로 보이게(CSS 없이도 동작)
      if (i > 0) block.style.marginTop = '-1px'
      const t = document.createElement('table')
      t.setAttribute('style', table.getAttribute('style') ?? '')
      t.append(colgroup.cloneNode(true))
      const tbody = document.createElement('tbody')
      group.forEach(r => tbody.append(r.cloneNode(true)))
      t.append(tbody)
      block.append(t)
      sec.append(block)
    })
  })

  prepareForCapture(sheet)
  return { sheet, execCount, rowCount }
}

// PDF 캡처(html2canvas) 결함 2가지를 시트 단계에서 막는다(2026-10-12 실측).
// 1) 글꼴: 웹폰트(Noto Sans KR, 구글 폰트 부분 파일)는 화면 배치와 캔버스 그리기에서 서로 다른
//    글꼴이 잡혀 띄어쓰기가 붙거나 벌어졌다 → 기기 내장 글꼴로 통일(화면 = PDF).
// 2) 줄 배경: html2canvas 는 <tr> 배경을 줄 전체 폭으로 칠해, 위 줄에서 두 줄을 차지한 칸
//    (「프로젝트명 / 담당임원」)의 글자를 덮었다 → 줄 배경을 각 칸으로 옮긴다(보이는 색은 동일).
const DEVICE_FONT = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

function prepareForCapture(sheet: HTMLElement) {
  sheet.style.fontFamily = DEVICE_FONT
  sheet.querySelectorAll<HTMLTableRowElement>('tr').forEach(tr => {
    const bg = tr.style.backgroundColor
    if (!bg) return
    for (const cell of Array.from(tr.cells)) {
      if (!cell.style.backgroundColor) cell.style.backgroundColor = bg
    }
    tr.style.backgroundColor = ''
  })
}
