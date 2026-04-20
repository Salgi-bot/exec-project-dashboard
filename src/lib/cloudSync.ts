import { supabase } from './supabase'
import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'

const STATE_ID = 'main'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

let _onStatus:       ((s: SyncStatus, at?: Date) => void) | null = null
let _onRemoteUpdate: (() => void) | null = null
let _onConflict:     ((keepMine: () => void, useTheirs: () => void) => void) | null = null

export function onSyncStatusChange(cb: typeof _onStatus)   { _onStatus       = cb }
export function onRemoteUpdated(cb: () => void)             { _onRemoteUpdate = cb }
export function onConflictDetected(cb: typeof _onConflict) { _onConflict     = cb }

function notify(s: SyncStatus, at?: Date) { _onStatus?.(s, at) }

let hasPendingChanges = false

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
    sheets:            s.sheets,
    activeSheetId:     s.activeSheetId,
    editQueue:         s.editQueue,
    fileName:          s.fileName,
    assigneeOverrides: s.assigneeOverrides,
    projectOrderMap:   s.projectOrderMap,
    deletedProjectIds: s.deletedProjectIds,
    projectMetaEdits:  s.projectMetaEdits,
    execOrder:         s.execOrder,
  }
}

function hasData(state: ReturnType<typeof getPersistedState> | null) {
  return !!(state?.fileName && Object.keys(state?.sheets ?? {}).length > 0)
}

// ── 저장 ──────────────────────────────────────────────────
async function saveToSupabase(retries = 2): Promise<boolean> {
  const persisted = getPersistedState()
  if (!hasData(persisted)) return false

  for (let i = 0; i <= retries; i++) {
    try {
      const { error } = await supabase.from('app_state').upsert({
        id:         STATE_ID,
        data:       persisted,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      hasPendingChanges = false
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
  return saveToSupabase(1)
}

export async function loadFromCloud(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', STATE_ID)
      .single()
    if (error) throw error
    if (hasData(data?.data)) {
      useAppStore.setState(syncExecutiveTitles(data.data))
      hasPendingChanges = false
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

// ── Realtime 구독 (다른 사용자 변경 즉시 반영) ─────────────
export function startPolling(): () => void {
  const channel = supabase
    .channel('app_state_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'app_state', filter: `id=eq.${STATE_ID}` },
      (payload) => {
        const remoteState = payload.new?.data
        if (!hasData(remoteState)) return

        if (hasPendingChanges) {
          _onConflict?.(
            async () => { await saveToSupabase(1) },
            () => {
              hasPendingChanges = false
              useAppStore.setState(syncExecutiveTitles(remoteState))
              notify('saved', new Date())
              _onRemoteUpdate?.()
            }
          )
        } else {
          useAppStore.setState(syncExecutiveTitles(remoteState))
          notify('saved', new Date())
          _onRemoteUpdate?.()
        }
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

// ── 초기화 ────────────────────────────────────────────────
export async function initCloudSync(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', STATE_ID)
      .single()

    if (error) console.warn('[CloudSync] 초기 로드 실패:', error)

    if (data && hasData(data.data)) {
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
    prevSnapshot      = next
    hasPendingChanges = true
    notify('saving')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveToSupabase(), 1500)
  })
}
