import { supabase } from './supabase'
import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'

const STATE_ID = 'main'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

let _onStatusChange: ((s: SyncStatus, lastAt?: Date) => void) | null = null
export function onSyncStatusChange(cb: (s: SyncStatus, lastAt?: Date) => void) {
  _onStatusChange = cb
}
function notify(s: SyncStatus, at?: Date) {
  _onStatusChange?.(s, at)
}

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

async function saveToCloud(retries = 2): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    try {
      const { error } = await supabase.from('app_state').upsert({
        id: STATE_ID,
        data: getPersistedState(),
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      notify('saved', new Date())
      return true
    } catch (e) {
      if (i === retries) {
        console.warn('[CloudSync] 저장 실패:', e)
        notify('error')
        return false
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  return false
}

export async function forceSave(): Promise<boolean> {
  notify('saving')
  return saveToCloud(1)
}

export async function loadFromCloud(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', STATE_ID)
      .single()
    if (error) throw error
    if (data?.data) {
      useAppStore.setState(syncExecutiveTitles(data.data))
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
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', STATE_ID)
      .single()

    if (error) console.warn('[CloudSync] 초기 로드 실패:', error)

    if (data?.data) {
      useAppStore.setState(syncExecutiveTitles(data.data))
      notify('saved', new Date())
    } else {
      useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
    }
  } catch (e) {
    console.warn('[CloudSync] 초기화 실패:', e)
    useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let prevSnapshot = JSON.stringify(getPersistedState())

  useAppStore.subscribe(() => {
    const next = JSON.stringify(getPersistedState())
    if (next === prevSnapshot) return
    prevSnapshot = next

    notify('saving')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveToCloud(), 1500)
  })
}
