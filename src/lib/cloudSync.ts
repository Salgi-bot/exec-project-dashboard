import { supabase } from './supabase'
import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'

const STATE_ID = 'main'

// 저장된 sheet 내 executive 정보를 최신 상수와 동기화 (직함 변경 반영)
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
  }
}

export async function initCloudSync(): Promise<void> {
  // Supabase에서 최신 상태 로드
  try {
    const { data } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', STATE_ID)
      .single()

    if (data?.data) {
      useAppStore.setState(syncExecutiveTitles(data.data))
    } else {
      // 로컬 상태도 동기화
      useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
    }
  } catch {
    useAppStore.setState(syncExecutiveTitles(useAppStore.getState()))
  }

  // 상태 변경 시 Supabase에 저장 (1.5초 디바운스)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let prevSnapshot = JSON.stringify(getPersistedState())

  useAppStore.subscribe(() => {
    const next = JSON.stringify(getPersistedState())
    if (next === prevSnapshot) return
    prevSnapshot = next

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await supabase.from('app_state').upsert({
          id: STATE_ID,
          data: getPersistedState(),
          updated_at: new Date().toISOString(),
        })
      } catch {
        // silent fail
      }
    }, 1500)
  })
}
