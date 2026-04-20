import { useRef, useState } from 'react'
import { useExcelImport } from '@/hooks/useExcelImport'
import { useAppStore } from '@/store/appStore'

const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined

export function FileImportButton() {
  const inputRef  = useRef<HTMLInputElement>(null)
  const { handleInputChange, handleDrop } = useExcelImport()
  const fileName  = useAppStore(s => s.fileName)

  const [modal, setModal]     = useState(false)
  const [pw, setPw]           = useState('')
  const [error, setError]     = useState(false)
  const [shake, setShake]     = useState(false)

  function openModal() { setModal(true); setPw(''); setError(false) }
  function closeModal() { setModal(false); setPw(''); setError(false) }

  function confirm() {
    if (!ADMIN_PW || pw === ADMIN_PW) {
      closeModal()
      inputRef.current?.click()
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <>
      <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleInputChange}
        />
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
          title={fileName || undefined}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {fileName ? '파일 변경' : 'Excel 가져오기'}
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className={`bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4 ${shake ? 'animate-shake' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <h3 className="font-bold text-gray-800">Excel 업로드 확인</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              새 파일을 업로드하면 <span className="font-semibold text-red-500">모든 사용자의 현재 데이터가 교체</span>됩니다.<br />
              관리자 비밀번호를 입력하세요.
            </p>
            <input
              type="password"
              value={pw}
              onChange={e => { setPw(e.target.value); setError(false) }}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              placeholder="비밀번호"
              autoFocus
              className={`w-full border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 ${
                error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {error && <p className="text-xs text-red-500 mb-3">비밀번호가 틀렸습니다.</p>}
            {!error && <div className="mb-3" />}
            <div className="flex gap-2">
              <button onClick={closeModal}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                취소
              </button>
              <button onClick={confirm}
                className="flex-1 px-3 py-2 text-white rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--ci-blue)' }}>
                업로드
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%,60% { transform: translateX(-6px) }
          40%,80% { transform: translateX(6px) }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </>
  )
}
