import { useCallback } from 'react'
import { parseExcelFile } from '@/utils/excelParser'
import { useAppStore } from '@/store/appStore'
import type { SheetId } from '@/types/project.types'

export function useExcelImport() {
  const setSheets = useAppStore(s => s.setSheets)

  const handleFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer()
    const sheets = parseExcelFile(buffer)
    setSheets(sheets as Record<SheetId, import('@/types/project.types').SheetData>, file.name)
  }, [setSheets])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.xlsx')) handleFile(file)
  }, [handleFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  return { handleFile, handleDrop, handleInputChange }
}
