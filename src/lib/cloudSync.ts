import { supabase } from './supabase'
import { useAppStore } from '@/store/appStore'

const STATE_ID = 'main'

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
      useAppStore.setState(data.data)
    }
  } catch {
    // 네트워크 오류 시 localStorage 상태 유지
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
