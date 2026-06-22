-- ============================================================================
-- 임원대시보드 Supabase 설정 (재현용 단일 출처)
-- ----------------------------------------------------------------------------
-- 이 파일은 "대시보드에서 수동 토글로만 켜둔 설정"을 코드로 못 박아,
-- DB를 통째로 다시 세우거나 복원할 때 동일 상태를 재현하기 위한 것이다.
-- 모두 멱등(idempotent) — 여러 번 실행해도 안전하다.
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.
-- (프로젝트 ref: ubzahzthvpbnodsdvpis / org: Salgi-bot's Org)
-- ============================================================================

-- 1) 전체 앱 상태를 담는 단일 행 테이블 ----------------------------------------
--    id='main' 한 행에 data(jsonb)로 전체 상태를 저장. updated_at = 낙관적
--    동시성(version-guard)의 기준 컬럼. (src/lib/cloudSync.ts 참조)
create table if not exists public.app_state (
  id          text primary key,
  data        jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) ★ Realtime 푸시 활성화 (이번 사고의 핵심) --------------------------------
--    app_state 가 supabase_realtime publication 에 등록돼 있어야 서버가
--    UPDATE 이벤트를 클라이언트로 밀어준다. 누락 시: 클라이언트 구독은
--    SUBSCRIBED 로 떠도 이벤트가 안 와서 "조용히 실패"한다(2026-06-22 사고).
--    아래는 이미 등록돼 있으면 건너뛰는 멱등 블록.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

-- 참고: 클라이언트 필터가 기본키(id=eq.main) 기준이라 REPLICA IDENTITY 추가
--       설정은 불필요(기본키는 항상 replica identity 에 포함). 만약 PK 외
--       컬럼으로 필터링하게 바꾸면 그때 `alter table public.app_state
--       replica identity full;` 가 필요해진다.

-- 3) (참고) 활성 상태 확인용 조회 --------------------------------------------
--    아래 쿼리가 1행을 반환하면 Realtime 푸시 정상.
--    select * from pg_publication_tables
--    where pubname='supabase_realtime' and tablename='app_state';
