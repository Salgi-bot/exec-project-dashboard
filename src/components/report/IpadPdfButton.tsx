import { useEffect, useState } from 'react'

// 아이패드(아이폰 포함)에서만 보이는 「PDF 만들기」 — PC 화면·PC 인쇄에는 아무것도 바뀌지 않는다.
// 아이패드 Safari 인쇄는 임원 묶음을 통째로 넘겨 쪽마다 빈칸이 생기고(실측 7쪽) 쪽 나눔을
// 재현·보장할 수 없어서, 출력 화면을 행 단위로 이어 붙인 A4 PDF를 코드가 직접 만든다(2026-10-12).
// PDF 라이브러리(html2canvas·jsPDF)는 버튼을 누를 때만 내려받는다(PC 로딩 무관).
function isIpadOrIphone(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function pdfFileName(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `임원회의_PROJECT진행일정표_${ymd}.pdf`
}

type Pdf = { file: File; url: string; pages: number }

const linkStyle: React.CSSProperties = {
  border: 0, background: 'none', padding: '6px 2px', color: 'var(--ci-blue)',
  fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
}

export function IpadPdfButton() {
  const [show]                  = useState(isIpadOrIphone)
  const [making, setMaking]     = useState<string | null>(null)
  const [pdf, setPdf]           = useState<Pdf | null>(null)
  const [error, setError]       = useState('')

  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url) }, [pdf])

  if (!show) return null

  async function handleMake() {
    const source = document.querySelector<HTMLElement>('.a4-pages-container')
    if (!source) return
    setPdf(null)
    setError('')
    setMaking('PDF 만드는 중…')
    // 캡처용 시트는 화면 밖(보이지 않는 곳)에 잠시 붙였다가 뗀다 — 화면의 출력 미리보기는 그대로.
    const holder = document.createElement('div')
    holder.style.cssText = 'position:absolute;left:-10000px;top:0;width:720px;background:#fff'
    document.body.appendChild(holder)
    try {
      const [{ buildFlowSheet }, { makeFlowPdf }] = await Promise.all([
        import('@/lib/flowPdf/flowSheet'),
        import('@/lib/flowPdf/makePdf'),
      ])
      const { sheet } = buildFlowSheet(source)
      sheet.style.boxShadow = 'none'
      sheet.style.minHeight = '0'
      holder.appendChild(sheet)
      const { blob, pages } = await makeFlowPdf(sheet, (done, total) => setMaking(`PDF 만드는 중… (${done}/${total})`))
      const file = new File([blob], pdfFileName(), { type: 'application/pdf' })
      setPdf({ file, url: URL.createObjectURL(blob), pages })
    } catch (e) {
      setError(`PDF를 만들지 못했습니다: ${(e as Error).message}`)
    } finally {
      holder.remove()
      setMaking(null)
    }
  }

  // 공유창은 사용자가 막 누른 직후에만 열리므로, 만들기와 보내기를 두 번의 탭으로 나눈다.
  async function handleShare() {
    if (!pdf) return
    try {
      await navigator.share({ files: [pdf.file], title: pdf.file.name })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`공유창을 열지 못했습니다 — 「파일로 저장」을 쓰십시오 (${(e as Error).message})`)
    }
  }

  const canShare = !!pdf && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdf.file] })

  return (
    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!pdf && (
          <button
            onClick={handleMake}
            disabled={!!making}
            className="px-5 py-2.5 text-white rounded-lg font-medium"
            style={{ backgroundColor: 'var(--ci-blue)', opacity: making ? 0.6 : 1 }}
          >
            {making ?? 'PDF 만들기 (아이패드)'}
          </button>
        )}
        {pdf && (
          <>
            {canShare && (
              <button
                onClick={handleShare}
                className="px-5 py-2.5 text-white rounded-lg font-medium"
                style={{ backgroundColor: 'var(--ci-blue)' }}
              >
                굿노트·노타빌리티로 보내기
              </button>
            )}
            <a href={pdf.url} download={pdf.file.name} data-pages={pdf.pages} style={linkStyle}>파일로 저장</a>
            <button onClick={() => setPdf(null)} style={linkStyle}>다시 만들기</button>
          </>
        )}
      </div>
      <span className="text-xs text-gray-500">
        {pdf ? `PDF 준비됨 · A4 ${pdf.pages}쪽 (행 단위로 이어 붙임)` : '아이패드 전용 · 쪽 빈칸 없이 A4 PDF'}
      </span>
      {error && <span className="text-xs" style={{ color: '#b91c1c' }}>{error}</span>}
    </div>
  )
}
