import { useAppStore } from '@/store/appStore'

const navItems = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'gantt', label: '간트차트' },
  { id: 'projects', label: '프로젝트 목록' },
  { id: 'report', label: '출력' },
] as const

interface Props {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: Props) {
  const viewMode = useAppStore(s => s.viewMode)
  const setViewMode = useAppStore(s => s.setViewMode)
  const fileName = useAppStore(s => s.fileName)

  const handleNav = (id: typeof navItems[number]['id']) => {
    setViewMode(id)
    onClose()
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`
        fixed md:sticky top-0 left-0 z-40
        w-60 h-screen bg-slate-800 text-white flex flex-col shrink-0
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-5 border-b border-slate-700">
          <h1 className="text-base font-bold text-white leading-tight">임원회의</h1>
          <p className="text-xs text-slate-400 mt-0.5">PROJECT 진행일정표</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                viewMode === item.id
                  ? 'text-white'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
              style={viewMode === item.id ? { backgroundColor: 'var(--ci-blue)' } : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {fileName && (
          <div className="px-4 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500 truncate">{fileName}</p>
          </div>
        )}

        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 leading-relaxed">
            © 2026 ㈜아이팝엔지니어링<br />
            김홍정. All rights reserved.
          </p>
        </div>
      </aside>
    </>
  )
}
