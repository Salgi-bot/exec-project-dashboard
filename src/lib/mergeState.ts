// 순수 상태 병합 로직 (클라우드 동기화용) — 3자 병합(기준 base · 내 것 local · 원격 remote).
// store / supabase 의존성 없음 → 단위 테스트 가능. cloudSync.ts 가 이 함수를 사용한다.
//
// 2026-10-18 재작성. 종전 mergeWithLocal 은 「내 editQueue 가 비어 있지 않으면 내 큐를 통째 채택」이었는데,
//   editQueue 는 모두의 셀 편집을 담은 공용 목록이라 불러온 직후부터 항상 비어 있지 않았다.
//   → 열어 둔 탭에 남의 입력이 안 보이고, 그 탭이 저장하면 남의 입력이 서버에서 지워졌다
//     (두 탭 재현 시험 9건으로 확인. 담당자·연도 탭도 같은 계열).
// 새 규칙: 마지막으로 서버와 맞춘 상태(base)를 기준으로 「내가 base 에서 바꾼 키만 내 값, 나머지는 원격 값」.
//   셀은 (프로젝트·월·주), 담당자·순서·이름 수정·임원 순서는 각 키, 삭제 목록은 원소, 프로젝트는 id 단위.
//   activeSheetId(보고 있는 연도)는 개인 화면 상태라 원격 값을 받지 않는다.

type ProjectLike = { id: string }
type SheetLike = { projects: ProjectLike[] }
type CellLike = { projectId: string; monthIndex: number; weekIndex: number }

export interface MergeableState {
  sheets?: Record<string, SheetLike | undefined>
  activeSheetId?: string
  editQueue: CellLike[]
  fileName?: string | null
  assigneeOverrides?: Record<string, unknown>
  projectOrderMap?: Record<string, unknown>
  deletedProjectIds?: string[]
  projectMetaEdits?: Record<string, unknown>
  execOrder?: Record<string, unknown>
}

// 키 순서와 무관한 비교. 서버(jsonb)는 객체 키 순서를 바꿔 돌려주므로 JSON.stringify 그대로 비교하면
// 손대지 않은 값도 「바뀜」으로 보여 내 옛 값이 원격을 덮는다.
function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
  }
  return JSON.stringify(v) ?? 'undefined'
}
export const sameValue = (a: unknown, b: unknown) => canon(a) === canon(b)

export const cellKey = (e: CellLike) => `${e.projectId}|${e.monthIndex}|${e.weekIndex}`

// 키 단위 3자 병합: 내가 base 에서 바꾼(추가·수정·삭제) 키는 내 값, 아니면 원격 값.
function mergeMap<T>(base: Record<string, T> | undefined, local: Record<string, T> | undefined,
                     remote: Record<string, T> | undefined): Record<string, T> {
  const b = base ?? {}, l = local ?? {}, r = remote ?? {}
  const out: Record<string, T> = {}
  const keys = [...Object.keys(r), ...Object.keys(l).filter(k => !(k in r)), ...Object.keys(b).filter(k => !(k in r) && !(k in l))]
  for (const k of keys) {
    const v = sameValue(l[k], b[k]) ? r[k] : l[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

// 배열을 키 맵으로 바꿔 병합한 뒤 순서를 「원격 순서 → 내 쪽에만 있는 것은 내 순서」로 되살린다.
function mergeList<T>(key: (x: T) => string, base: T[] | undefined, local: T[] | undefined, remote: T[] | undefined): T[] {
  const toMap = (xs: T[] | undefined) => Object.fromEntries((xs ?? []).map(x => [key(x), x])) as Record<string, T>
  const merged = mergeMap(toMap(base), toMap(local), toMap(remote))
  const out: T[] = []
  const seen = new Set<string>()
  for (const x of [...(remote ?? []), ...(local ?? [])]) {
    const k = key(x)
    if (seen.has(k) || !(k in merged)) continue
    seen.add(k)
    out.push(merged[k])
  }
  return out
}

function mergeIdSet(base: string[] | undefined, local: string[] | undefined, remote: string[] | undefined): string[] {
  const B = new Set(base ?? []), L = new Set(local ?? [])
  const added   = (local ?? []).filter(id => !B.has(id))
  const removed = new Set((base ?? []).filter(id => !L.has(id)))
  const out: string[] = []
  for (const id of [...(remote ?? []), ...added]) if (!removed.has(id) && !out.includes(id)) out.push(id)
  return out
}

function mergeSheets(base: MergeableState['sheets'], local: MergeableState['sheets'],
                     remote: MergeableState['sheets']): Record<string, SheetLike | undefined> {
  const b = base ?? {}, l = local ?? {}, r = remote ?? {}
  const out: Record<string, SheetLike | undefined> = {}
  for (const id of new Set([...Object.keys(r), ...Object.keys(l)])) {
    const bS = b[id], lS = l[id], rS = r[id]
    if (!rS) { if (lS && !sameValue(lS, bS)) out[id] = lS; continue }   // 내가 새로 만든(바꾼) 시트만 남김
    if (!lS) { if (!bS) out[id] = rS; continue }                         // 내가 지운 시트(가져오기 교체)는 뺌
    // 시트 머리(기간·임원 목록)는 통째 비교, 프로젝트는 id 단위
    const head = (s: SheetLike | undefined) => s ? { ...s, projects: undefined } : undefined
    const sheetHead = sameValue(head(lS), head(bS)) ? rS : lS
    out[id] = { ...sheetHead, projects: mergeList(p => p.id, bS?.projects, lS.projects, rS.projects) }
  }
  return out
}

export function merge3(base: MergeableState | null, local: MergeableState, remote: MergeableState): MergeableState {
  const b: Partial<MergeableState> = base ?? {}
  return {
    ...remote,
    sheets:            mergeSheets(b.sheets, local.sheets, remote.sheets),
    activeSheetId:     local.activeSheetId ?? remote.activeSheetId,   // 개인 화면 상태 — 원격 값 안 받음
    editQueue:         mergeList(cellKey, b.editQueue, local.editQueue, remote.editQueue),
    fileName:          sameValue(local.fileName, b.fileName) ? remote.fileName : local.fileName,
    assigneeOverrides: mergeMap(b.assigneeOverrides, local.assigneeOverrides, remote.assigneeOverrides),
    projectOrderMap:   mergeMap(b.projectOrderMap, local.projectOrderMap, remote.projectOrderMap),
    deletedProjectIds: mergeIdSet(b.deletedProjectIds, local.deletedProjectIds, remote.deletedProjectIds),
    projectMetaEdits:  mergeMap(b.projectMetaEdits, local.projectMetaEdits, remote.projectMetaEdits),
    execOrder:         mergeMap(b.execOrder, local.execOrder, remote.execOrder),
  }
}

// 개인 화면 상태(activeSheetId)를 뺀 공유 데이터가 같은가 — 「내 미저장 변경이 남아 있는가」 판정용.
export function sameShared(a: MergeableState, b: MergeableState): boolean {
  return sameValue({ ...a, activeSheetId: undefined }, { ...b, activeSheetId: undefined })
}
