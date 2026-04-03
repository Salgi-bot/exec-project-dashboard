import { useRef } from 'react'
import { useExcelImport } from '@/hooks/useExcelImport'
import { useAppStore } from '@/store/appStore'

export function FileImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { handleInputChange, handleDrop } = useExcelImport()
  const fileName = useAppStore(s => s.fileName)

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleInputChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {fileName ? '파일 변경' : 'Excel 파일 가져오기'}
      </button>
      {fileName && (
        <p className="text-xs text-gray-500 mt-1 truncate max-w-48">{fileName}</p>
      )}
    </div>
  )
}
