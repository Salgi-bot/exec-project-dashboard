import { useState, useEffect } from 'react'
import { Modal } from '@/components/shared/Modal'
import { useAppStore } from '@/store/appStore'
import { useFilteredProjects, useActiveSheet } from '@/hooks/useFilteredProjects'
import { getMonthLabels } from '@/constants/periods'
import { useMeetingGuard } from '@/hooks/useMeetingGuard'

function absWeekToMonthWeek(abs: number) {
  return { monthIndex: Math.floor(abs / 4), weekIndex: abs % 4 }
}
function monthWeekToAbs(monthIndex: number, weekIndex: number) {
  return monthIndex * 4 + weekIndex
}

export function StatusEditModal() {
  const editingCell  = useAppStore(s => s.editingCell)
  const editingRange = useAppStore(s => s.editingRange)
  const setEditingCell  = useAppStore(s => s.setEditingCell)
  const setEditingRange = useAppStore(s => s.setEditingRange)
  const applyEdit      = useAppStore(s => s.applyEdit)
  const applyRangeEdit = useAppStore(s => s.applyRangeEdit)
  const guard          = useMeetingGuard(s => s.guard)
  const projects = useFilteredProjects()
  const sheet = useActiveSheet()

  const [text, setText] = useState('')
  const [startAbs, setStartAbs] = useState(0)
  const [endAbs, setEndAbs]     = useState(0)

  const isOpen = !!(editingCell || editingRange)

  useEffect(() => {
    if (!isOpen || !sheet) return

    let initialAbs = 0
    let projectId = ''

    if (editingRange) {
      initialAbs = editingRange.startAbsWeek
      projectId  = editingRange.projectId
      setStartAbs(Math.min(editingRange.startAbsWeek, editingRange.endAbsWeek))
      setEndAbs(Math.max(editingRange.startAbsWeek, editingRange.endAbsWeek))
    } else if (editingCell) {
      initialAbs = monthWeekToAbs(editingCell.monthIndex, editingCell.weekIndex)
      projectId  = editingCell.projectId
      setStartAbs(initialAbs)
      setEndAbs(initialAbs)
    }

    // 현재 텍스트 및 기존 병합 범위 채우기
    const project = projects.find(p => p.id === projectId)
    if (project) {
      const { monthIndex, weekIndex } = absWeekToMonthWeek(initialAbs)
      const ws = project.weekStatuses.find(s => s.monthIndex === monthIndex && s.weekIndex === weekIndex)
      setText(ws?.text || '')
      // 기존 병합 셀이면 colSpan만큼 종료일 자동 설정
      if (ws && ws.colSpan >= 2) {
        const maxAbs = (sheet.period.totalMonths * 4) - 1
        setEndAbs(Math.min(maxAbs, initialAbs + ws.colSpan - 1))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCell, editingRange, isOpen])

  if (!isOpen || !sheet) return null

  const projectId = editingCell?.projectId ?? editingRange?.projectId ?? ''
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  const monthLabels = getMonthLabels(sheet.period)
  const maxAbsWeek  = sheet.period.totalMonths * 4 - 1

  const handleClose = () => {
    setEditingCell(null)
    setEditingRange(null)
  }

  const handleSave = () => {
    guard(() => {
      if (startAbs === endAbs) {
        const { monthIndex, weekIndex } = absWeekToMonthWeek(startAbs)
        applyEdit({ projectId, monthIndex, weekIndex, newText: text, timestamp: Date.now() })
      } else {
        applyRangeEdit(projectId, startAbs, endAbs, text)
      }
      handleClose()
    })
  }

  const handleClear = () => {
    guard(() => {
      applyRangeEdit(projectId, startAbs, endAbs, '')
      handleClose()
    })
  }

  const startMW = absWeekToMonthWeek(startAbs)
  const endMW   = absWeekToMonthWeek(endAbs)

  const monthOptions = monthLabels.map((ml, i) => ({
    value: i,
    label: `${ml.yearShort} ${ml.label}`,
  }))

  function clamp(v: number) { return Math.max(0, Math.min(maxAbsWeek, v)) }

  return (
    <Modal open={isOpen} onClose={handleClose} title="진행 현황 편집" size="md">
      <div className="space-y-4">
        {/* 프로젝트 정보 */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="font-semibold text-gray-800">{project.projectName}</p>
          {project.client && <p className="text-sm text-gray-500">{project.client}</p>}
        </div>

        {/* 기간 설정 */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">적용 기간</p>
          <div className="grid grid-cols-2 gap-3">
            {/* 시작 */}
            <div>
              <p className="text-xs text-gray-500 mb-1">시작</p>
              <div className="flex gap-1">
                <select
                  value={startMW.monthIndex}
                  onChange={e => {
                    const newAbs = clamp(monthWeekToAbs(Number(e.target.value), startMW.weekIndex))
                    setStartAbs(newAbs)
                    if (newAbs > endAbs) setEndAbs(newAbs)
                  }}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {monthOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={startMW.weekIndex}
                  onChange={e => {
                    const newAbs = clamp(monthWeekToAbs(startMW.monthIndex, Number(e.target.value)))
                    setStartAbs(newAbs)
                    if (newAbs > endAbs) setEndAbs(newAbs)
                  }}
                  className="w-16 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {[0,1,2,3].map(w => <option key={w} value={w}>{w+1}주</option>)}
                </select>
              </div>
            </div>
            {/* 종료 */}
            <div>
              <p className="text-xs text-gray-500 mb-1">종료</p>
              <div className="flex gap-1">
                <select
                  value={endMW.monthIndex}
                  onChange={e => {
                    const newAbs = clamp(monthWeekToAbs(Number(e.target.value), endMW.weekIndex))
                    setEndAbs(newAbs)
                    if (newAbs < startAbs) setStartAbs(newAbs)
                  }}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {monthOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={endMW.weekIndex}
                  onChange={e => {
                    const newAbs = clamp(monthWeekToAbs(endMW.monthIndex, Number(e.target.value)))
                    setEndAbs(newAbs)
                    if (newAbs < startAbs) setStartAbs(newAbs)
                  }}
                  className="w-16 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {[0,1,2,3].map(w => <option key={w} value={w}>{w+1}주</option>)}
                </select>
              </div>
            </div>
          </div>
          {startAbs !== endAbs && (
            <p className="text-xs text-blue-600 mt-1.5">
              {endAbs - startAbs + 1}주 ({Math.ceil((endAbs - startAbs + 1) / 4 * 10) / 10}개월) 범위에 일괄 적용
            </p>
          )}
        </div>

        {/* 내용 입력 */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">내용</p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="진행 현황을 입력하세요..."
            autoFocus
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 justify-between">
          <button
            onClick={handleClear}
            className="px-3 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
          >
            내용 삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
