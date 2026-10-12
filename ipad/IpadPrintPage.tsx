import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReportView } from '@/components/report/ReportView'
import { loadReadOnly } from './loadReadOnly'
import { buildFlowSheet } from '@/lib/flowPdf/flowSheet'
import { makeFlowPdf } from '@/lib/flowPdf/makePdf'

type Status = 'loading' | 'ready' | 'error'
type Pdf = { file: File; url: string; pages: number }

function pdfFileName(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `임원회의_PROJECT진행일정표_${ymd}.pdf`
}

export function IpadPrintPage() {
  const [status, setStatus]     = useState<Status>('loading')
  const [error, setError]       = useState('')
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [counts, setCounts]     = useState({ execCount: 0, rowCount: 0 })
  const [making, setMaking]     = useState<string | null>(null)
  const [pdf, setPdf]           = useState<Pdf | null>(null)
  const [pdfError, setPdfError] = useState('')
  const sourceRef = useRef<HTMLDivElement>(null)
  const flowRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadReadOnly()
      .then(() => { setLoadedAt(new Date()); setStatus('ready') })
      .catch((e: Error) => { setError(e.message); setStatus('error') })
  }, [])

  // ReportView 가 그린 원본(숨김)을 행 단위 블록으로 복제해, React 가 관리하지 않는 컨테이너에 넣는다.
  useLayoutEffect(() => {
    if (status !== 'ready' || !sourceRef.current || !flowRef.current) return
    const { sheet, execCount, rowCount } = buildFlowSheet(sourceRef.current)
    flowRef.current.replaceChildren(sheet)
    setCounts({ execCount, rowCount })
  }, [status])

  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url) }, [pdf])

  async function handleMake() {
    const sheet = flowRef.current?.querySelector<HTMLElement>('.flow-sheet')
    if (!sheet) return
    setPdf(null)
    setPdfError('')
    setMaking('PDF 만드는 중…')
    try {
      const { blob, pages } = await makeFlowPdf(sheet, (done, total) => setMaking(`PDF 만드는 중… (${done}/${total})`))
      const file = new File([blob], pdfFileName(), { type: 'application/pdf' })
      setPdf({ file, url: URL.createObjectURL(blob), pages })
    } catch (e) {
      setPdfError(`PDF를 만들지 못했습니다: ${(e as Error).message}`)
    } finally {
      setMaking(null)
    }
  }

  // 공유창은 사용자가 막 누른 직후에만 열리므로, 만들기와 보내기를 두 번의 탭으로 나눈다.
  async function handleShare() {
    if (!pdf) return
    try {
      await navigator.share({ files: [pdf.file], title: pdf.file.name })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setPdfError(`공유창을 열지 못했습니다 — 「파일로 저장」을 쓰십시오 (${(e as Error).message})`)
    }
  }

  const canShare = !!pdf && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdf.file] })
  const time = loadedAt?.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ipad-page">
      <div className="ipad-bar no-print">
        <div>
          <div className="ipad-title">임원회의 진행일정표 · 아이패드 PDF</div>
          <div className="ipad-sub">
            {status === 'loading' && '불러오는 중…'}
            {status === 'error' && <span className="ipad-err">불러오지 못했습니다: {error}</span>}
            {status === 'ready' && <>임원 {counts.execCount}명 · {counts.rowCount}건 · {time} 기준 (최신 내용은 새로고침)</>}
          </div>
        </div>
        <div className="ipad-actions">
          {!pdf && (
            <button className="ipad-print" disabled={status !== 'ready' || !!making} onClick={handleMake}>
              {making ?? 'PDF 만들기'}
            </button>
          )}
          {pdf && (
            <>
              {canShare && (
                <button className="ipad-print" onClick={handleShare}>굿노트·노타빌리티로 보내기</button>
              )}
              <a className="ipad-link" href={pdf.url} download={pdf.file.name} data-pages={pdf.pages}>파일로 저장</a>
              <button className="ipad-link" onClick={() => setPdf(null)}>다시 만들기</button>
            </>
          )}
        </div>
      </div>
      <div className="ipad-hint no-print">
        {pdf
          ? <>PDF 준비됨 · A4 {pdf.pages}쪽. 「굿노트·노타빌리티로 보내기」 → 공유창에서 Goodnotes 또는 Notability를 고르십시오.</>
          : <>「PDF 만들기」를 누르면 아래 표를 A4로 이어 붙인 PDF를 만듭니다. 쪽은 빈칸 없이 이어지고, 한 행이 쪽 경계에서 잘리지는 않습니다. 이 페이지는 보기 전용입니다.</>}
        {pdfError && <div className="ipad-err">{pdfError}</div>}
      </div>

      {/* 원본(숨김) — 데이터 계산은 본체 출력과 동일한 ReportView 그대로 */}
      <div className="ipad-source" ref={sourceRef} aria-hidden="true">
        {status === 'ready' && <ReportView />}
      </div>

      {/* 화면에 보이는 행 단위 시트 = PDF 로 찍히는 그대로 */}
      <div className="ipad-flow" ref={flowRef} />
    </div>
  )
}
