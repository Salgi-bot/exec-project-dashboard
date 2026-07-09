// ── 배포 버전 감시 (옛 탭 자동 정리) ──────────────────────────
// 목적: 새 코드가 배포됐는데도 "예전에 열어둔 탭"이 옛 코드를 물고 계속 도는 사고를
//       근절한다. (2026-07-06 임원 대시보드 실시간 동기화 에코-스톰 재발 방지책)
//
// 원리: Vite 빌드는 배포마다 index.html 안의 번들 파일명 해시(assets/index-XXXX.js)를
//       바꾼다. 지금 이 페이지가 물고 있는 번들 지문을 기준으로 잡고, 주기적으로
//       index.html을 "캐시 없이" 다시 받아 지문이 달라졌으면 새 배포로 판정한다.
//       → GitHub Pages 정적 파일 폴링일 뿐이라 Supabase egress와 전혀 무관.
//
// 안전 원칙:
//   - PROD(빌드본)에서만 동작. 개발(vite dev)에선 no-op — 해시가 없어 오판 소지.
//   - 지문을 못 읽으면(태그 부재) 그냥 비활성. "오작동보다 미작동"이 안전.
//   - 이 모듈은 cloudSync(6/22·7/6에 힘겹게 안정화한 동기화 로직)를 일절 건드리지 않는다.
//   - 실제 리로드 여부/시점은 호출부(AppShell)가 유휴 판정으로 결정한다. 여긴 "감지"만.

const POLL_MS = 5 * 60 * 1000 // 5분마다 확인 (임원 대시보드는 상시 켜두므로 interval 필수)
const INDEX_URL = `${import.meta.env.BASE_URL}index.html`

// 번들 지문에서 비교 키만 추출: 절대 URL이든 상대경로든 "/assets/index-XXXX.js"만 본다.
function assetKey(src: string): string | null {
  const m = src.match(/\/assets\/[^"'?\s]+/)
  return m ? m[0] : null
}

// 지금 이 페이지가 실제로 실행 중인 번들의 지문 (startup fetch가 아니라 DOM에서 읽는다 —
// 페이지 로드 직전에 배포가 있었어도 "현재 코드"를 정확히 기준삼기 위함).
function currentBundleKey(): string | null {
  const scripts = Array.from(
    document.querySelectorAll('script[type="module"][src]'),
  ) as HTMLScriptElement[]
  for (const s of scripts) {
    const key = assetKey(s.src)
    if (key) return key
  }
  return null
}

// 서버에 지금 배포돼 있는 번들의 지문.
async function fetchDeployedKey(): Promise<string | null> {
  const res = await fetch(`${INDEX_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  const html = await res.text()
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\/assets\/[^"]+)"/)
  return m ? assetKey(m[1]) : null
}

/**
 * 배포 버전 감시를 시작한다. 새 배포가 감지되면 onUpdate를 딱 한 번 호출한다.
 * @returns 정리 함수 (감시 중단)
 */
export function startVersionWatch(onUpdate: () => void): () => void {
  if (!import.meta.env.PROD) return () => {}

  const baseline = currentBundleKey()
  if (!baseline) return () => {} // 지문을 못 읽으면 비활성 (안전)

  let fired = false
  let timer: ReturnType<typeof setInterval> | null = null

  const check = async () => {
    if (fired) return
    try {
      const deployed = await fetchDeployedKey()
      if (deployed && deployed !== baseline) {
        fired = true
        onUpdate()
        if (timer) clearInterval(timer)
      }
    } catch {
      /* 네트워크 실패는 무시하고 다음 주기 재시도 */
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }

  timer = setInterval(check, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
