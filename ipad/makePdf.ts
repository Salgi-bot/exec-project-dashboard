// 행 단위 시트를 A4 PDF로 직접 만든다 — 쪽 나눔을 아이패드 인쇄 엔진이 아니라 이 코드가 정한다.
//
// 배경(2026-10-12): 아이패드 Safari 인쇄는 맥·Chromium 어느 엔진으로도 쪽 나눔이 재현되지 않아
// (보드 출력: 맥 4쪽 vs 아이패드 7쪽), 브라우저 인쇄에 맡기면 결과를 보장할 수 없었다.
// 여기서는 블록(행) 위치를 DOM에서 재서 A4(여백 10mm)에 차례로 쌓고, 남은 칸에 안 들어가는
// 블록만 다음 쪽으로 넘긴다 → 쪽 사이 빈칸은 많아야 다음 행 하나 높이, 행 중간 잘림 0.
// 임원 제목줄은 첫 행과 한 블록이라 쪽 맨 아래에 홀로 남지 않는다.
// 캡처는 임원 단위(.flow-sec)로 한 번씩 한다 — 시트 전체를 한 장으로 찍으면 iOS 캔버스 한도를 넘는다.
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

const PAGE_W_MM = 210
const PAGE_H_MM = 297
const MARGIN_MM = 10
const FOOTER_MM = 6 // 쪽 번호 자리
const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2
const CONTENT_H_MM = PAGE_H_MM - MARGIN_MM * 2 - FOOTER_MM
const SCALE = 2.5 // 캡처 배율(아이패드에서 확대해도 글자가 읽히는 정도)

type Block = { part: number; relTop: number; relBottom: number; absTop: number; absBottom: number }

export async function makeFlowPdf(
  sheet: HTMLElement,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; pages: number }> {
  await document.fonts?.ready

  const sheetRect = sheet.getBoundingClientRect()
  const k = CONTENT_W_MM / sheetRect.width // mm / CSS px
  const parts = Array.from(sheet.querySelectorAll<HTMLElement>(':scope > .flow-head, :scope > .flow-sec'))

  // 1) 블록 위치 측정(시트 기준 절대 위치 + 소속 파트 기준 상대 위치)
  const blocks: Block[] = []
  parts.forEach((part, pi) => {
    const pr = part.getBoundingClientRect()
    const items = part.classList.contains('flow-head')
      ? [part]
      : Array.from(part.querySelectorAll<HTMLElement>(':scope > .flow-block'))
    for (const el of items) {
      const r = el.getBoundingClientRect()
      blocks.push({
        part: pi,
        relTop: r.top - pr.top, relBottom: r.bottom - pr.top,
        absTop: r.top - sheetRect.top, absBottom: r.bottom - sheetRect.top,
      })
    }
  })

  // 2) 쪽 배정 — 블록 단위로만 넘긴다
  const pages: Block[][] = []
  let cur: Block[] = []
  let pageTop = 0
  for (const b of blocks) {
    if (cur.length > 0 && (b.absBottom - pageTop) * k > CONTENT_H_MM) {
      pages.push(cur)
      cur = []
    }
    if (cur.length === 0) pageTop = b.absTop
    cur.push(b)
  }
  if (cur.length) pages.push(cur)

  // 3) 쪽마다 같은 파트의 연속 블록을 한 조각(run)으로 묶는다
  type Run = { page: number; part: number; relTop: number; relBottom: number; yMm: number; hMm: number; fit: number }
  const runs: Run[] = []
  pages.forEach((pb, pi) => {
    const top = pb[0].absTop
    const used = (pb[pb.length - 1].absBottom - top) * k
    const fit = used > CONTENT_H_MM ? CONTENT_H_MM / used : 1 // 한 블록이 한 쪽보다 큰 극단적 경우만 축소
    let run: Run | null = null
    for (const b of pb) {
      if (run && run.part === b.part) {
        run.relBottom = b.relBottom
        run.hMm = (b.absBottom - top) * k * fit - run.yMm
      } else {
        const yMm = (b.absTop - top) * k * fit
        run = { page: pi, part: b.part, relTop: b.relTop, relBottom: b.relBottom, yMm, hMm: (b.absBottom - b.absTop) * k * fit, fit }
        runs.push(run)
      }
    }
  })

  // 4) PDF 생성 — 파트 하나씩 캡처해 해당 조각들을 각 쪽에 그리고 바로 메모리 해제
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  for (let i = 1; i < pages.length; i++) doc.addPage('a4', 'portrait')

  for (let pi = 0; pi < parts.length; pi++) {
    onProgress?.(pi, parts.length)
    const partRuns = runs.filter(r => r.part === pi)
    if (partRuns.length === 0) continue
    const canvas = await html2canvas(parts[pi], { scale: SCALE, backgroundColor: '#ffffff', logging: false, useCORS: true })
    const ratio = canvas.height / parts[pi].getBoundingClientRect().height
    for (const r of partRuns) {
      const sy = Math.max(0, Math.floor(r.relTop * ratio))
      const sh = Math.min(canvas.height - sy, Math.ceil((r.relBottom - r.relTop) * ratio))
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sh
      slice.getContext('2d')!.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
      doc.setPage(r.page + 1)
      const wMm = CONTENT_W_MM * r.fit
      doc.addImage(slice, 'PNG', MARGIN_MM + (CONTENT_W_MM - wMm) / 2, MARGIN_MM + r.yMm, wMm, r.hMm, undefined, 'FAST')
      slice.width = 0
      slice.height = 0
    }
    canvas.width = 0
    canvas.height = 0
  }
  onProgress?.(parts.length, parts.length)

  // 쪽 번호
  for (let i = 1; i <= pages.length; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`${i} / ${pages.length}`, PAGE_W_MM / 2, PAGE_H_MM - MARGIN_MM + 2, { align: 'center' })
  }

  return { blob: doc.output('blob'), pages: pages.length }
}
