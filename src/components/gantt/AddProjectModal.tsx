import { useState, useMemo } from 'react'
import { Modal } from '@/components/shared/Modal'
import { useAppStore } from '@/store/appStore'
import { useActiveSheet } from '@/hooks/useFilteredProjects'
import { isProjectDuplicate } from '@/utils/similarity'
import { EXECUTIVE_MAP } from '@/constants/executives'
import type { Executive } from '@/types/project.types'

interface Props {
  executive: Executive | null
  onClose: () => void
}

export function AddProjectModal({ executive, onClose }: Props) {
  const addCustomProject = useAppStore(s => s.addCustomProject)
  const sheet = useActiveSheet()
  const [projectName, setProjectName] = useState('')
  const [client, setClient] = useState('')
  const [assignee, setAssignee] = useState('')

  // 유사 프로젝트 실시간 감지
  const duplicates = useMemo(() => {
    if (!sheet || (!projectName.trim() && !client.trim())) return []
    return sheet.projects
      .filter(p => !p.isManagerSummaryRow)
      .filter(p =>
        (projectName.trim().length >= 2 || client.trim().length >= 2) &&
        isProjectDuplicate(projectName.trim(), client.trim(), p.projectName, p.client)
      )
  }, [sheet, projectName, client])

  if (!executive) return null

  const defaultAssignee = EXECUTIVE_MAP[executive.id]?.name || executive.name

  const handleSave = () => {
    if (!projectName.trim()) return
    addCustomProject(
      executive.id,
      projectName.trim(),
      client.trim(),
      assignee.trim() || defaultAssignee,
    )
    onClose()
    setProjectName('')
    setClient('')
    setAssignee('')
  }

  return (
    <Modal open={!!executive} onClose={onClose} title="프로젝트 추가" size="sm">
      <div className="space-y-4">
        <div className="bg-blue-50 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-600">담당 임원</p>
          <p className="font-semibold text-blue-800">{executive.name} {executive.title}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            프로젝트명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="프로젝트명 입력..."
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">발주처 / 시공사</label>
          <input
            type="text"
            value={client}
            onChange={e => setClient(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="발주처 또는 시공사명 (선택)"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            담당자
            <span className="text-xs text-gray-400 ml-1">(미입력 시 {defaultAssignee})</span>
          </label>
          <input
            type="text"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder={defaultAssignee}
          />
        </div>

        {/* 유사 프로젝트 경고 */}
        {duplicates.length > 0 && (
          <div className="bg-orange-50 border border-orange-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-orange-700 mb-1">
              ⚠️ 유사한 프로젝트가 이미 존재합니다
            </p>
            {duplicates.slice(0, 3).map(p => {
              const exec = EXECUTIVE_MAP[p.executiveId]
              return (
                <p key={p.id} className="text-xs text-orange-600">
                  • {p.projectName}{p.client ? ` (${p.client})` : ''} — {exec?.name} {exec?.title}
                </p>
              )
            })}
            {duplicates.length > 3 && (
              <p className="text-xs text-orange-500 mt-1">외 {duplicates.length - 3}건...</p>
            )}
            <p className="text-xs text-orange-500 mt-1.5">중복 입력이 아닌지 확인 후 저장하세요.</p>
          </div>
        )}

        <p className="text-xs text-gray-400">
          추가 후 간트 차트에서 셀 클릭 또는 드래그로 기간·내용을 입력하세요.
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!projectName.trim()}
            className={`px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 ${
              duplicates.length > 0
                ? 'bg-orange-500 hover:bg-orange-600'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {duplicates.length > 0 ? '⚠️ 그래도 추가' : '추가'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
