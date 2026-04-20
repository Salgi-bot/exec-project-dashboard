import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'

const GIST_ID    = import.meta.env.VITE_GIST_ID    as string | undefined
const GIST_TOKEN = import.meta.env.VITE_GIST_TOKEN as string | undefined
const GIST_FILE  = 'exec_dashboard_state.json'
const POLL_MS    = 30_000

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── 콜백 레지스트리 ──────────────────────────────────────────
let _onStatus:       ((s: SyncStatus, at?: Date) => void) | null = null
let _onRemoteUpdate: (() => void) | null = null
let _onConflict:     ((keepMine: () => void, useTheirs: () => void) => void) | null = null

export function onSyncStatusChange(cb: typeof _onStatus)    { _onStatus       = cb }
export function onRemoteUpdated(cb: () => void)              { _onRemoteUpdate = cb }
export function onConflictDetected(cb: typeof _onConflict)  { _onConflict     = cb }

function notify(s: SyncStatus, at?: Date) { _onStatus?.(s, at) }

// ── 상태 추적 ──────────────────────────────────────────────
let currentETag:         string | null = null
let lastKnownUpdatedAt:  string | null = null
let hasPendingChanges                  = false

// ── exec title 동기화 ──────────────────────────────────────
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

function gistAvailable() { return !!(GIST_ID && GIST_TOKEN) }

// ── GitHub Gist API ────────────────────────────────────────
interface GistGetResult {
  notModified: boolean
  etag:        string | null
  updatedAt:   string | null
  state:       ReturnType<typeof useAppStore.getState> | null
}

async function gistGet(): Promise<GistGetResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GIST_TOKEN}`,
    Accept:        'application/vnd.github+json',
  }
  if (currentETag) headers['If-None-Match'] = currentETag

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers })

  if (res.status === 304) {
    return { notModified: true, etag: currentETag, updatedAt: lastKnownUpdatedAt, state: null }
  }
  if (!res.ok) throw new Error(`GitHub GET ${res.status}`)

  const etag      = res.headers.get('ETag')
  const gist      = await res.json()
  const updatedAt = gist.updated_at as string
  const raw       = gist.files?.[GIST_FILE]?.content as string | undefined
  const parsed    = raw ? JSON.parse(raw) : null
  const state     = parsed?.data ?? parsed

  return { notModified: false, etag, updatedAt, state: state?.sheets ? state : null }
}

async function gistPatch(content: string): Promise<{ etag: string | null; updatedAt: string }> {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization:  `Bearer ${GIST_TOKEN}`,
      Accept:         'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: { [GIST_FILE]: { content } } }),
  })
  if (!res.ok) throw new Error(`GitHub PATCH ${res.status}: ${await res.text()}`)
  const etag = res.headers.get('ETag')
  const gist = await res.json()
  return { etag, updatedAt: gist.updated_at as string }
}

// ── 저장 ──────────────────────────────────────────────────
async function saveToGist(retries = 2): Promise<boolean> {
  if (!gistAvailable()) { notify('error'); return false }
  const persisted = getPersistedState()
  if (!persisted.fileName || Object.keys(persisted.sheets ?? {}).length === 0) {
    return false  // Excel 미임포트 상태는 저장 안 함
  }
  for (let i = 0; i <= retries; i++) {
    try {
      const content = JSON.stringify({
        data:       persisted,
        updated_at: new Date().toISOString(),
      })
      const { etag, updatedAt } = await gistPatch(content)
      currentETag        = etag
      lastKnownUpdatedAt = updatedAt
      hasPendingChanges  = false
      notify('saved', new Date())
      return true
    } catch (e) {
      if (i === retries) { console.warn('[CloudSync] 저장 실패:', e); notify('error'); return false }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  return false
}

// ── 공개 API ──────────────────────────────────────────────
export async function forceSave(): Promise<boolean> {
  notify('saving')
  return saveToGist(1)
}

export async function loadFromCloud(): Promise<boolean> {
  if (!gistAvailable()) { notify('error'); return false }
  try {
    const { notModified, etag, updatedAt, state } = await gistGet()
    if (notModified) return true
    currentETag        = etag
    lastKnownUpdatedAt = updatedAt
    const hasData = state?.fileName && Object.keys(state?.sheets ?? {}).length > 0
    if (hasData) {
      useAppStore.setState(syncExecutiveTitles(state))
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

// ── 폴링 (30초마다 변경 확인) ─────────────────────────────
async function checkForRemoteUpdates(): Promise<void> {
  if (!gistAvailable()) return
  try {
    const { notModified, etag, updatedAt, state } = await gistGet()
    if (notModified) return           // ETag 동일 → 변경 없음
    if (!state) return

    const isRemoteNewer = updatedAt !== lastKnownUpdatedAt
    const hasData = state?.fileName && Object.keys(state?.sheets ?? {}).length > 0

    if (!isRemoteNewer || !hasData) return

    if (hasPendingChanges) {
      // 충돌: 내 변경사항 + 원격 변경사항 동시 존재
      _onConflict?.(
        async () => {
          // 내 것 유지 → 원격 덮어쓰기
          await saveToGist(1)
        },
        () => {
          // 원격 것 사용
          currentETag        = etag
          lastKnownUpdatedAt = updatedAt
          hasPendingChanges  = false
          useAppStore.setState(syncExecutiveTitles(state))
          notify('saved', new Date())
          _onRemoteUpdate?.()
        }
      )
    } else {
      // 충돌 없음 → 자동으로 원격 데이터 반영
      currentETag        = etag
      lastKnownUpdatedAt = updatedAt
      useAppStore.setState(syncExecutiveTitles(state))
      notify('saved', new Date())
      _onRemoteUpdate?.()
    }
  } catch (e) {
    console.warn('[CloudSync] 폴링 실패:', e)
  }
}

export function startPolling(): () => void {
  const id = setInterval(checkForRemoteUpdates, POLL_MS)
  return () => clearInterval(id)
}

// ── 초기화 ────────────────────────────────────────────────
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
    prevSnapshot      = next
    hasPendingChanges = true
    notify('saving')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveToGist(), 1500)
  })
}
