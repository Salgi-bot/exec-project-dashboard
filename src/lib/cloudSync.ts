import { supabase } from './supabase'
import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'
import type { SheetId } from '@/types/project.types'

const STATE_ID = 'main'

// 마지막으로 인지한 서버 버전(updated_at). 저장 시 이 버전일 때만 덮어쓴다(낙관적 동시성).
// → 복원 전 열어둔 옛 탭이 최신 데이터를 통째로 덮어버리는 사고를 구조적으로 방지.
let lastKnownUpdatedAt: string | null = null

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

let _onStatus:       ((s: SyncStatus, at?: Date) => void) | null = null
let _onRemoteUpdate: (() => void) | null = null

export function onSyncStatusChange(cb: typeof _onStatus) { _onStatus       = cb }
export function onRemoteUpdated(cb: () => void)           { _onRemoteUpdate = cb }

function notify(s: SyncStatus, at?: Date) { _onStatus?.(s, at) }


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

// 프로젝트 단위 병합: 내가 수정한 프로젝트는 내 버전, 나머지는 원격 버전
function mergeWithLocal(remoteState: ReturnType<typeof getPersistedState>): ReturnType<typeof getPersistedState> {
  const local = getPersistedState()
  const localEditedIds = new Set(local.editQueue.map(e => e.projectId))

  if (localEditedIds.size === 0) return remoteState  // 로컬 변경 없으면 원격 그대로

  const mergedSheets = { ...remoteState.sheets }
  for (const sheetId of Object.keys(remoteState.sheets ?? {}) as SheetId[]) {
    const remoteSheet = remoteState.sheets?.[sheetId]
    const localSheet  = local.sheets?.[sheetId]
    if (!remoteSheet || !localSheet) continue

    const localMap = new Map(localSheet.projects.map(p => [p.id, p]))
    mergedSheets[sheetId] = {
      ...remoteSheet,
      projects: remoteSheet.projects.map(p =>
        localEditedIds.has(p.id) ? (localMap.get(p.id) ?? p) : p
      ),
    }
  }

  return {
    ...remoteState,
    sheets:            mergedSheets,
    editQueue:         local.editQueue,
    assigneeOverrides: { ...remoteState.assigneeOverrides, ...local.assigneeOverrides },
    projectOrderMap:   { ...remoteState.projectOrderMap,   ...local.projectOrderMap   },
    projectMetaEdits:  { ...remoteState.projectMetaEdits,  ...local.projectMetaEdits  },
    execOrder:         Object.keys(local.execOrder ?? {}).length > 0 ? local.execOrder : remoteState.execOrder,
  }
}

// ── 저장 (낙관적 동시성) ───────────────────────────────────
// 내가 아는 서버 버전(lastKnownUpdatedAt)일 때만 덮어쓴다. 그 사이 다른 사람이 저장했으면
// (버전 충돌) 통째로 덮지 않고 최신본을 받아 내 변경만 병합 후 재저장한다.
async function saveToSupabase(retries = 2): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    const persisted = getPersistedState()
    if (!hasData(persisted)) return false
    try {
      const now = new Date().toISOString()

      if (lastKnownUpdatedAt) {
        // 조건부 업데이트: 내가 아는 버전일 때만 적용
        const { data, error } = await supabase
          .from('app_state')
          .update({ data: persisted, updated_at: now })
          .eq('id', STATE_ID)
          .eq('updated_at', lastKnownUpdatedAt)
          .select('updated_at')
        if (error) throw error

        if (data && data.length > 0) {
          lastKnownUpdatedAt = data[0].updated_at as string
          notify('saved', new Date())
          return true
        }

        // 0행 = 그 사이 다른 사람이 저장함 → 최신본을 받아 내 변경과 병합(통째 덮어쓰기 방지)
        const fresh = await supabase
          .from('app_state')
          .select('data,updated_at')
          .eq('id', STATE_ID)
          .single()
        if (!fresh.error && fresh.data && hasData(fresh.data.data)) {
          lastKnownUpdatedAt = fresh.data.updated_at as string
          const merged = mergeWithLocal(fresh.data.data)
          // 병합본 반영 → 실제 변경이 있으면 구독이 올바른 버전으로 재저장 트리거
          useAppStore.setState(syncExecutiveTitles(merged as ReturnType<typeof useAppStore.getState>))
        }
        return false
      }

      // 서버 버전 미상(최초 저장) → upsert로 생성/덮어쓰기
      const { data, error } = await supabase
        .from('app_state')
        .upsert({ id: STATE_ID, data: persisted, updated_at: now })
        .select('updated_at')
      if (error) throw error
      if (data && data.length > 0) lastKnownUpdatedAt = data[0].updated_at as string
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
      .select('data,updated_at')
      .eq('id', STATE_ID)
      .single()
    if (error) throw error
    if (hasData(data?.data)) {
      lastKnownUpdatedAt = data.updated_at as string
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
        if (payload.new?.updated_at) lastKnownUpdatedAt = payload.new.updated_at as string

        // 프로젝트 단위 자동 병합 (내 수정 보존 + 원격 수정 반영)
        const merged = mergeWithLocal(remoteState)
        useAppStore.setState(syncExecutiveTitles(merged as ReturnType<typeof useAppStore.getState>))
        notify('saved', new Date())
        _onRemoteUpdate?.()

        // 병합 결과를 즉시 저장 (내 변경 + 원격 변경 통합본)
        if (merged.editQueue.length > 0) {
          setTimeout(() => saveToSupabase(), 500)
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
      .select('data,updated_at')
      .eq('id', STATE_ID)
      .single()

    if (error) console.warn('[CloudSync] 초기 로드 실패:', error)

    if (data && hasData(data.data)) {
      lastKnownUpdatedAt = data.updated_at as string
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
    notify('saving')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveToSupabase(), 1500)
  })
}
