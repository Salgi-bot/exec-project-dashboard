import { supabase } from './supabase'
import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'
import { merge3, sameShared, type MergeableState } from './mergeState'

const STATE_ID = 'main'

// 마지막으로 인지한 서버 버전(updated_at). 저장 시 이 버전일 때만 덮어쓴다(낙관적 동시성).
// → 복원 전 열어둔 옛 탭이 최신 데이터를 통째로 덮어버리는 사고를 구조적으로 방지.
let lastKnownUpdatedAt: string | null = null

// 마지막으로 서버와 맞춘 상태(3자 병합의 기준). 불러오기·저장 성공·원격 수신 때 갱신한다.
// ★2026-10-18: 「내 편집」을 공용 editQueue 에서 추정하지 않고, 이 기준과 내 상태의 차이로 판단한다.
let baseState: MergeableState | null = null

// 이미 반영한 서버 버전들(시각 문자열 형식 차이를 없애려고 ms 숫자로 보관). 내 저장의 에코나, 충돌 처리 때 이미
// 받아 본 옛 버전의 실시간 알림이 늦게 오면 다시 처리하지 않는다 — 옛 상태로 병합하면 방금 저장한 내 입력이
// 「원격에서 지워진 것」처럼 보여 다시 지워진다.
const seenVersions = new Set<number>()
// 서버 시각 문자열 → ms. 알림의 시각 표기가 REST 응답과 다르게(공백 구분·「+00」처럼 짧은 시차) 올 경우에 대비해
// ISO 형식으로 고쳐 읽는다 — 그런 표기는 사파리(아이패드)의 Date.parse 가 NaN 을 낸다. 실측 표기 확인 전의 방어 코드.
function verMs(v: string | null | undefined): number {
  if (!v) return NaN
  const iso = v.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')
  return Date.parse(iso)
}
function markSeen(v: string | null | undefined) {
  const t = verMs(v)
  if (isNaN(t)) return
  seenVersions.add(t)
  if (seenVersions.size > 500) seenVersions.delete(seenVersions.values().next().value as number)
}
const wasSeen = (v: string | undefined) => { const t = verMs(v); return !isNaN(t) && seenVersions.has(t) }

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

let _onStatus:       ((s: SyncStatus, at?: Date) => void) | null = null
let _onRemoteUpdate: (() => void) | null = null

export function onSyncStatusChange(cb: typeof _onStatus) { _onStatus       = cb }
export function onRemoteUpdated(cb: () => void)           { _onRemoteUpdate = cb }

function notify(s: SyncStatus, at?: Date) { _onStatus?.(s, at) }


function syncExecutiveTitles<T extends { sheets?: unknown }>(state: T): T {
  const src = state.sheets as Record<string, { executives?: { id: string }[] } | undefined> | undefined
  if (!src) return state
  const sheets = { ...src }
  for (const key of Object.keys(sheets)) {
    const sheet = sheets[key]
    if (!sheet?.executives) continue
    sheets[key] = {
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
type Persisted = ReturnType<typeof getPersistedState>

function hasData(state: { fileName?: unknown; sheets?: unknown } | null | undefined) {
  return !!(state?.fileName && Object.keys((state?.sheets as object) ?? {}).length > 0)
}

// ── 저장 예약(디바운스) ─────────────────────────────────────
// prevSnapshot = 마지막으로 「저장할 필요 없음」을 확인한 상태. 원격을 반영해서 생긴 변화는 여기에 바로 반영해
// 재저장하지 않는다(수신 탭마다 1회씩 되쓰던 에코의 원인). 내 미저장 변경이 남아 있을 때만 저장을 예약한다.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let prevSnapshot = ''

// 저장 필요 여부를 가르는 스냅숏 — 보고 있는 연도(activeSheetId)는 개인 화면 상태라 빼서, 탭만 바꿀 때는 저장하지 않는다.
const snap = () => JSON.stringify({ ...getPersistedState(), activeSheetId: undefined })

// 동기화가 store 를 바꿀 때(원격 반영·충돌 병합·불러오기). zustand 구독자는 setState 안에서 동기로 불리므로
// 표시를 세워 「내 손 변화」로 오인해 저장을 예약하지 않게 한다(10/18 시험: 받은 탭마다 1회 되쓰기).
let applyingSync = false
function setFromSync(state: object) {
  applyingSync = true
  try { useAppStore.setState(state as Partial<ReturnType<typeof useAppStore.getState>>) } finally { applyingSync = false }
  prevSnapshot = snap()
}

function scheduleSave(delay = 1500) {
  notify('saving')
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; void saveToSupabase() }, delay)
}

// 내 미저장 변경(기준과 다른 공유 데이터)이 남아 있고 저장 예약이 없으면 예약한다.
function ensurePendingSaved() {
  if (baseState && !sameShared(getPersistedState() as MergeableState, baseState) && !saveTimer) scheduleSave()
}

// 원격(remote)과 기준(base)을 합친 결과를 store 에 반영. 원격 반영분은 재저장하지 않고, 내 미저장 변경만 저장 예약.
function applyMerged(merged: MergeableState) {
  setFromSync(merged)
  ensurePendingSaved()
}

// ── 저장 (낙관적 동시성) ───────────────────────────────────
// 내가 아는 서버 버전(lastKnownUpdatedAt)일 때만 덮어쓴다. 그 사이 다른 사람이 저장했으면
// (버전 충돌) 최신본을 받아 3자 병합(내가 바꾼 키만 내 값) 후 곧바로 다시 저장한다.
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
          markSeen(lastKnownUpdatedAt)
          baseState = persisted as MergeableState
          notify('saved', new Date())
          ensurePendingSaved()   // 저장하는 사이에 생긴 내 변경이 있으면 이어서 저장
          return true
        }

        // 0행 = 그 사이 다른 사람이 저장함 → 최신본을 받아 3자 병합 후 다시 저장(통째 덮어쓰기 방지)
        const fresh = await supabase
          .from('app_state')
          .select('data,updated_at')
          .eq('id', STATE_ID)
          .single()
        if (fresh.error || !fresh.data || !hasData(fresh.data.data)) throw fresh.error ?? new Error('최신본 조회 실패')
        lastKnownUpdatedAt = fresh.data.updated_at as string
        markSeen(lastKnownUpdatedAt)
        const before = snap()
        const remote = syncExecutiveTitles(fresh.data.data as MergeableState)
        const merged = merge3(baseState, getPersistedState() as MergeableState, remote)
        baseState = remote
        setFromSync(merged)
        if (prevSnapshot !== before) _onRemoteUpdate?.()
        if (sameShared(getPersistedState() as MergeableState, remote)) { notify('saved', new Date()); return true }
        continue   // ★종전엔 여기서 끝나 내 변경이 서버에 안 가고 「저장 중」에 멈췄다 → 즉시 재저장
      }

      // 서버 버전 미상(최초 저장) → upsert로 생성/덮어쓰기
      const { data, error } = await supabase
        .from('app_state')
        .upsert({ id: STATE_ID, data: persisted, updated_at: now })
        .select('updated_at')
      if (error) throw error
      if (data && data.length > 0) lastKnownUpdatedAt = data[0].updated_at as string
      markSeen(lastKnownUpdatedAt)
      baseState = persisted as MergeableState
      notify('saved', new Date())
      ensurePendingSaved()
      return true
    } catch (e) {
      if (i === retries) { console.warn('[CloudSync] 저장 실패:', e); notify('error'); return false }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  // 충돌이 연달아 나 재시도 횟수를 다 썼다 → 잠시 뒤 다시 시도
  scheduleSave(3000)
  return false
}

export async function forceSave(): Promise<boolean> {
  notify('saving')
  return saveToSupabase(1)
}

// 서버 상태를 통째로 받아 들이되, 보고 있던 연도는 내 화면 것을 유지한다(그 연도가 있을 때).
function adoptServerState(serverData: Persisted, updatedAt: string) {
  const remote = syncExecutiveTitles(serverData)
  const myTab = useAppStore.getState().activeSheetId
  const keepTab = myTab && (remote.sheets as Record<string, unknown> | undefined)?.[myTab]
  lastKnownUpdatedAt = updatedAt
  markSeen(updatedAt)
  baseState = remote as MergeableState
  setFromSync({ ...remote, ...(keepTab ? { activeSheetId: myTab } : {}) })
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
      adoptServerState(data.data as Persisted, data.updated_at as string)
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

// 서버 최신본을 받아 3자 병합. 시각이 내가 아는 버전보다 이른 알림(늦게 온 옛 버전이거나, 시계가 늦은 PC의 저장)은
// 알림 내용을 믿지 않고 이 경로로 처리한다 — 옛 내용과 병합하면 그 창 화면이 옛 상태로 돌아간다(감사 A261018-183144 8번).
async function refreshFromServer() {
  const { data, error } = await supabase
    .from('app_state')
    .select('data,updated_at')
    .eq('id', STATE_ID)
    .single()
  if (error || !data || !hasData(data.data)) return
  const v = data.updated_at as string
  if (v === lastKnownUpdatedAt || wasSeen(v)) return
  const before = snap()
  const remote = syncExecutiveTitles(data.data as MergeableState)
  const merged = merge3(baseState, getPersistedState() as MergeableState, remote)
  baseState = remote
  lastKnownUpdatedAt = v
  markSeen(v)
  applyMerged(merged)
  if (snap() !== before) { notify('saved', new Date()); _onRemoteUpdate?.() }
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

        const incoming = payload.new?.updated_at as string | undefined
        // 이미 반영한 버전(내 저장의 에코, 충돌 때 받아 본 옛 버전)이면 다시 처리하지 않는다 → 에코·역행 방지
        if (incoming && (incoming === lastKnownUpdatedAt || wasSeen(incoming))) return

        // 첫 불러오기 전(기준 없음)에 온 알림 → 브라우저에 남은 옛 데이터를 「내 변경」으로 오인하지 않도록 서버 상태를 그대로 받는다
        if (!baseState) {
          if (incoming) { adoptServerState(remoteState as Persisted, incoming); notify('saved', new Date()); _onRemoteUpdate?.() }
          return
        }

        // 내가 아는 버전보다 이른 시각의 알림 → 내용 대신 서버 최신본으로 병합
        const inMs = verMs(incoming), knownMs = verMs(lastKnownUpdatedAt)
        if (!isNaN(inMs) && !isNaN(knownMs) && inMs < knownMs) { void refreshFromServer(); return }

        // 3자 병합: 내가 기준에서 바꾼 키만 내 값, 나머지(남의 입력)는 원격 값
        const before = snap()
        const remote = syncExecutiveTitles(remoteState as MergeableState)
        const merged = merge3(baseState, getPersistedState() as MergeableState, remote)
        baseState = remote
        if (incoming) { lastKnownUpdatedAt = incoming; markSeen(incoming) }
        applyMerged(merged)

        // 실제로 내 화면 데이터가 바뀐 경우에만 알림(동일 데이터 에코 → 무음)
        if (snap() !== before) {
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
      .select('data,updated_at')
      .eq('id', STATE_ID)
      .single()

    if (error) console.warn('[CloudSync] 초기 로드 실패:', error)

    if (data && hasData(data.data)) {
      adoptServerState(data.data as Persisted, data.updated_at as string)
      notify('saved', new Date())
    } else {
      useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
    }
  } catch (e) {
    console.warn('[CloudSync] 초기화 실패:', e)
    useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
  }

  prevSnapshot = snap()

  // 내 손으로 생긴 변화만 저장한다. 원격 반영은 applyMerged·adoptServerState 가 prevSnapshot 을 먼저 맞춰 둔다.
  useAppStore.subscribe(() => {
    if (applyingSync) return
    const next = snap()
    if (next === prevSnapshot) return
    prevSnapshot = next
    scheduleSave()
  })
}
