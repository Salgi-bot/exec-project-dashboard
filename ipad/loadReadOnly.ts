import { useAppStore } from '@/store/appStore'
import { EXECUTIVE_MAP } from '@/constants/executives'

// 클라우드 상태를 GET 한 번으로 받아 화면용 store 에만 넣는다(서버 쓰기 경로 없음).
// 임원 직함·순서 보정은 본체 cloudSync 의 syncExecutiveTitles 와 같은 규칙.
export async function loadReadOnly(): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${url}/rest/v1/app_state?id=eq.main&select=data`, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`)
  const rows = (await res.json()) as { data: ReturnType<typeof useAppStore.getState> }[]
  const data = rows[0]?.data
  if (!data?.sheets || Object.keys(data.sheets).length === 0) throw new Error('데이터 없음')

  const sheets = { ...data.sheets }
  for (const id of Object.keys(sheets) as (keyof typeof sheets)[]) {
    const sheet = sheets[id]
    if (!sheet?.executives) continue
    sheets[id] = {
      ...sheet,
      executives: sheet.executives.map(e => {
        const latest = EXECUTIVE_MAP[e.id]
        return latest ? { ...e, title: latest.title, order: latest.order } : e
      }),
    }
  }
  useAppStore.setState({ ...data, sheets })
}
