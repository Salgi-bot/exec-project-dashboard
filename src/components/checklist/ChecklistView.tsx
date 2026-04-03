import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { ChecklistPriority, ChecklistItem } from '@/types/project.types'

const PRIORITY_CONFIG: Record<ChecklistPriority, { label: string; color: string; dot: string }> = {
  high:   { label: '긴급', color: 'text-red-600 bg-red-50 border-red-200',   dot: 'bg-red-500' },
  normal: { label: '보통', color: 'text-blue-600 bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  low:    { label: '낮음', color: 'text-gray-500 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
}

function AddItemForm({ onClose }: { onClose: () => void }) {
  const addChecklistItem = useAppStore(s => s.addChecklistItem)
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<ChecklistPriority>('normal')
  const [dueDate, setDueDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    addChecklistItem(text.trim(), priority, dueDate || null)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">새 항목 추가</h3>
      <div className="space-y-3">
        <input
          autoFocus
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="체크리스트 내용 입력..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">우선순위</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as ChecklistPriority)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">긴급</option>
              <option value="normal">보통</option>
              <option value="low">낮음</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">마감일 (선택)</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!text.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            추가
          </button>
        </div>
      </div>
    </form>
  )
}

function EditItemForm({ item, onClose }: { item: ChecklistItem; onClose: () => void }) {
  const updateChecklistItem = useAppStore(s => s.updateChecklistItem)
  const [text, setText] = useState(item.text)
  const [priority, setPriority] = useState<ChecklistPriority>(item.priority)
  const [dueDate, setDueDate] = useState(item.dueDate ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    updateChecklistItem(item.id, text.trim(), priority, dueDate || null)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
      <input
        autoFocus
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex gap-2">
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as ChecklistPriority)}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="high">긴급</option>
          <option value="normal">보통</option>
          <option value="low">낮음</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">취소</button>
        <button type="submit" disabled={!text.trim()} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">저장</button>
      </div>
    </form>
  )
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const toggleChecklistItem = useAppStore(s => s.toggleChecklistItem)
  const deleteChecklistItem = useAppStore(s => s.deleteChecklistItem)
  const [editing, setEditing] = useState(false)

  const cfg = PRIORITY_CONFIG[item.priority]
  const isOverdue = item.dueDate && !item.checked && new Date(item.dueDate) < new Date(new Date().toDateString())

  return (
    <div className={`bg-white rounded-xl border px-4 py-3 transition-all ${item.checked ? 'border-gray-100 opacity-60' : 'border-gray-200 shadow-sm'}`}>
      <div className="flex items-start gap-3">
        {/* 체크박스 */}
        <button
          onClick={() => toggleChecklistItem(item.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
            item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          {item.checked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${item.checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.text}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            {item.dueDate && (
              <span className={`text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                {isOverdue ? '⚠ ' : ''}마감 {item.dueDate}
              </span>
            )}
          </div>

          {editing && <EditItemForm item={item} onClose={() => setEditing(false)} />}
        </div>

        {/* 액션 버튼 */}
        {!item.checked && (
          <button
            onClick={() => setEditing(v => !v)}
            className="text-gray-400 hover:text-blue-500 transition-colors p-1 shrink-0"
            title="수정"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.364-6.364a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3.535.884.884-3.536a4 4 0 01.94-1.414z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => deleteChecklistItem(item.id)}
          className="text-gray-400 hover:text-red-500 transition-colors p-1 shrink-0"
          title="삭제"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function ChecklistView() {
  const items = useAppStore(s => s.checklistItems)
  const clearCheckedItems = useAppStore(s => s.clearCheckedItems)
  const [showAddForm, setShowAddForm] = useState(false)
  const [filterPriority, setFilterPriority] = useState<ChecklistPriority | 'all'>('all')
  const [showChecked, setShowChecked] = useState(true)

  const sorted = [...items].sort((a, b) => {
    const pOrder: Record<ChecklistPriority, number> = { high: 0, normal: 1, low: 2 }
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    if (a.priority !== b.priority) return pOrder[a.priority] - pOrder[b.priority]
    return b.createdAt - a.createdAt
  })

  const filtered = sorted.filter(item => {
    if (!showChecked && item.checked) return false
    if (filterPriority !== 'all' && item.priority !== filterPriority) return false
    return true
  })

  const pendingCount = items.filter(i => !i.checked).length
  const checkedCount = items.filter(i => i.checked).length

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">✅ 보스 체크리스트</h2>
          <p className="text-gray-500 text-sm mt-1">
            {pendingCount}개 미완료 · {checkedCount}개 완료
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          항목 추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showAddForm && <AddItemForm onClose={() => setShowAddForm(false)} />}

      {/* 필터 바 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'high', 'normal', 'low'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filterPriority === p ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === 'all' ? '전체' : PRIORITY_CONFIG[p].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showChecked}
            onChange={e => setShowChecked(e.target.checked)}
            className="rounded"
          />
          완료 항목 표시
        </label>
        {checkedCount > 0 && (
          <button
            onClick={clearCheckedItems}
            className="ml-auto text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            완료 항목 모두 삭제
          </button>
        )}
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">체크리스트가 비어있습니다.</p>
          <p className="text-xs mt-1">위의 항목 추가 버튼을 눌러 시작하세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => <ChecklistRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
