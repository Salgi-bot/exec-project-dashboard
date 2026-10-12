// ── 아이패드 인쇄용 개인 페이지 (웹 본체와 별도 번들) ─────────────
// 목적: 아이패드 Safari 인쇄 → PDF → 굿노트·노타빌리티 경로에서 임원 묶음을 통째로
//       다음 쪽으로 넘기며 생기는 빈칸 없이, 행 단위로 쪽을 이어 채운다(2026-10-12 보스 지시).
// 원칙: 읽기 전용. cloudSync(저장·구독)는 일절 import 하지 않는다 — 버전 정보 없이 저장하면
//       upsert로 통째 덮어쓰는 경로가 있기 때문. 데이터는 REST GET 한 번으로만 받는다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '@/store/appStore'
import { IpadPrintPage } from './IpadPrintPage'
import './ipad.css'

// 본체 앱과 같은 origin 이라 localStorage('exec-dashboard-store')를 공유한다.
// 이 페이지에서 받은 데이터가 본체 앱의 로컬 저장분을 덮지 않도록 영속화 쓰기를 끊는다.
// (하이드레이션은 읽기만 하므로 무해 — 화면에는 GET으로 받은 최신본만 쓴다.)
useAppStore.persist.setOptions({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IpadPrintPage />
  </StrictMode>,
)
