import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'

const GIST_ID    = import.meta.env.VITE_GIST_ID    as string | undefined
const GIST_TOKEN = import.meta.env.VITE_GIST_TOKEN as string | undefined
const GIST_FILE  = 'exec_dashboard_state.json'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

let _onStatusChange: ((s: SyncStatus, lastAt?: Date) => void) | null = null
export function onSyncStatusChange(cb: (s: SyncStatus, lastAt?: Date) => void) {
  _onStatusChange = cb
}
function notify(s: SyncStatus, at?: Date) { _onStatusChange?.(s, at) }

function syncExecutiveTitles(state: ReturnType<typeof useAppStore.getState>) {
  if (!state.sheets) return state
  const sheets = { ...state.sheets }
  for (const key of Object.keys(sheets)) {
    const sheet = sheets[key as keyof typeof sheets]
    if (!sheet?.executives) continue
    sheets[key as keyof typeof sheets] = {
      ...sheet,
      executives: sheet.executives.map(e => {
        const latest = EXECUTIVE_MAP[e.id]
        return latest ? { ...e, title: latest.title, order: latest.order } : e
      }),
    }
  }
  return { ...state, sheets }
}

function getPersistedState() {
  const s = useAppStore.getState()
  return {
    sheets: s.sheets,
    activeSheetId: s.activeSheetId,
    editQueue: s.editQueue,
    fileName: s.fileName,
    assigneeOverrides: s.assigneeOverrides,
    projectOrderMap: s.projectOrderMap,
    deletedProjectIds: s.deletedProjectIds,
    projectMetaEdits: s.projectMetaEdits,
    execOrder: s.execOrder,
  }
}

function gistAvailable() {
  return !!(GIST_ID && GIST_TOKEN)
}

async function gistFetch<T = unknown>(method: 'GET' | 'PATCH', body?: object): Promise<T> {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method,
    headers: {
      Authorization: `Bearer ${GIST_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GitHub Gist API ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function saveToGist(retries = 2): Promise<boolean> {
  if (!gistAvailable()) { notify('error'); return false }
  for (let i = 0; i <= retries; i++) {
    try {
      await gistFetch('PATCH', {
        files: {
          [GIST_FILE]: {
            content: JSON.stringify({
              data: getPersistedState(),
              updated_at: new Date().toISOString(),
            }),
          },
        },
      })
      notify('saved', new Date())
      return true
    } catch (e) {
      if (i === retries) { console.warn('[CloudSync] 저장 실패:', e); notify('error'); return false }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  return false
}

export async function forceSave(): Promise<boolean> {
  notify('saving')
  return saveToGist(1)
}

export async function loadFromCloud(): Promise<boolean> {
  if (!gistAvailable()) { notify('error'); return false }
  try {
    const gist = await gistFetch<{ files: Record<string, { content: string }> }>('GET')
    const raw = gist.files?.[GIST_FILE]?.content
    if (!raw) return false
    const parsed = JSON.parse(raw)
    const state = parsed.data ?? parsed
    if (state?.sheets) {
      useAppStore.setState(syncExecutiveTitles(state))
      notify('saved', new Date())
      return true
    }
    return false
  } catch (e) {
    console.warn('[CloudSync] 불러오기 실패:', e)
    notify('error')
    return false
  }
}

export async function initCloudSync(): Promise<void> {
  if (!gistAvailable()) {
    console.warn('[CloudSync] VITE_GIST_TOKEN / VITE_GIST_ID 환경변수 없음')
    useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
    return
  }

  const loaded = await loadFromCloud()
  if (!loaded) useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let prevSnapshot = JSON.stringify(getPersistedState())

  useAppStore.subscribe(() => {
    const next = JSON.stringify(getPersistedState())
    if (next === prevSnapshot) return
    prevSnapshot = next
    notify('saving')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveToGist(), 1500)
  })
}
