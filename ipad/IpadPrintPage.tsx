import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReportView } from '@/components/report/ReportView'
import { loadReadOnly } from './loadReadOnly'
import { buildFlowSheet } from './flowSheet'

type Status = 'loading' | 'ready' | 'error'

export function IpadPrintPage() {
  const [status, setStatus]     = useState<Status>('loading')
  const [error, setError]       = useState('')
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [counts, setCounts]     = useState({ execCount: 0, rowCount: 0 })
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

  const time = loadedAt?.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ipad-page">
      <div className="ipad-bar no-print">
        <div>
          <div className="ipad-title">임원회의 진행일정표 · 아이패드 인쇄용</div>
          <div className="ipad-sub">
            {status === 'loading' && '불러오는 중…'}
            {status === 'error' && <span className="ipad-err">불러오지 못했습니다: {error}</span>}
            {status === 'ready' && <>임원 {counts.execCount}명 · {counts.rowCount}건 · {time} 기준 (최신 내용은 새로고침)</>}
          </div>
        </div>
        <button className="ipad-print" disabled={status !== 'ready'} onClick={() => window.print()}>
          프린트 (PDF)
        </button>
      </div>
      <div className="ipad-hint no-print">
        프린트 미리보기에서 두 손가락으로 벌리면 PDF가 됩니다 → 공유 → Goodnotes 또는 Notability.
        쪽은 빈칸 없이 이어지고, 한 행이 쪽 경계에서 잘리지는 않습니다. 이 페이지는 보기·인쇄 전용입니다.
      </div>

      {/* 원본(숨김) — 데이터 계산은 본체 출력과 동일한 ReportView 그대로 */}
      <div className="ipad-source" ref={sourceRef} aria-hidden="true">
        {status === 'ready' && <ReportView />}
      </div>

      {/* 인쇄·화면에 실제로 보이는 행 단위 시트 */}
      <div className="ipad-flow" ref={flowRef} />
    </div>
  )
}
