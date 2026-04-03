import { useRef } from 'react'
import { useExcelImport } from '@/hooks/useExcelImport'

export function EmptyState() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { handleInputChange, handleDrop } = useExcelImport()

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-96">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-blue-300 rounded-2xl p-12 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-center max-w-md"
      >
        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleInputChange} />
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">Excel 파일을 가져오세요</h3>
        <p className="text-gray-500 text-sm">
          진행일정표 .xlsx 파일을 드래그하거나<br />클릭하여 선택하세요
        </p>
      </div>
    </div>
  )
}
