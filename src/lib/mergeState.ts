// 순수 상태 병합 로직 (클라우드 동기화용).
// store / supabase 의존성 없음 → 단위 테스트 가능. cloudSync.ts 가 이 함수를 사용한다.
//
// 배경: 원격 UPDATE(다른 사용자 저장·Realtime)가 오면 로컬 상태와 병합한다.
//  - 내가 편집(editQueue)한 프로젝트는 내 버전 유지
//  - 내가 방금 "등록"(addCustomProject)했지만 아직 원격에 없는 프로젝트는 삭제되지 않도록 보존
//  - 내 편집이 전혀 없는 순수 열람자는 원격의 editQueue(모두의 동기화된 셀 편집)를 그대로 채택

type ProjectLike = { id: string }
type SheetLike = { projects: ProjectLike[] }

export interface MergeableState {
  sheets?: Record<string, SheetLike | undefined>
  editQueue: { projectId: string }[]
  assigneeOverrides?: Record<string, string>
  projectOrderMap?: Record<string, number>
  projectMetaEdits?: Record<string, unknown>
  execOrder?: Record<string, string[]>
}

export function mergeWithLocal(remoteState: MergeableState, local: MergeableState): MergeableState {
  const localEditedIds = new Set(local.editQueue.map(e => e.projectId))
  const remoteSheets = remoteState.sheets ?? {}
  const localSheets  = local.sheets ?? {}

  // 로컬에만 있는(원격엔 아직 없는) 신규 등록 프로젝트가 있는가?
  let localOnlyExists = false
  for (const sheetId of Object.keys(localSheets)) {
    const remoteSheet = remoteSheets[sheetId]
    const localSheet  = localSheets[sheetId]
    if (!localSheet) continue
    if (!remoteSheet) { localOnlyExists = true; break }
    const remoteIds = new Set(remoteSheet.projects.map(p => p.id))
    if (localSheet.projects.some(p => !remoteIds.has(p.id))) { localOnlyExists = true; break }
  }

  // 내 편집도 없고 신규 등록도 없으면 → 순수 열람자: 원격 그대로 채택(원격 editQueue = 모두의 편집).
  if (localEditedIds.size === 0 && !localOnlyExists) return remoteState

  const mergedSheets: Record<string, SheetLike | undefined> = { ...remoteSheets }
  for (const sheetId of Object.keys(localSheets)) {
    const remoteSheet = remoteSheets[sheetId]
    const localSheet  = localSheets[sheetId]
    if (!localSheet) continue
    if (!remoteSheet) { mergedSheets[sheetId] = localSheet; continue }  // 시트 전체가 로컬 신규

    const localMap  = new Map(localSheet.projects.map(p => [p.id, p]))
    const remoteIds = new Set(remoteSheet.projects.map(p => p.id))
    // 1) 원격 프로젝트: 내가 편집한 건 내 버전 우선, 아니면 원격
    const mergedProjects = remoteSheet.projects.map(p =>
      localEditedIds.has(p.id) ? (localMap.get(p.id) ?? p) : p
    )
    // 2) 로컬에만 있는(신규 등록) 프로젝트는 뒤에 덧붙임 → 원격 UPDATE에 삭제되지 않게
    const localOnly = localSheet.projects.filter(p => !remoteIds.has(p.id))
    mergedSheets[sheetId] = { ...remoteSheet, projects: [...mergedProjects, ...localOnly] }
  }

  return {
    ...remoteState,
    sheets:            mergedSheets,
    // 내 편집이 있을 때만 내 editQueue 채택. 순수 열람이면 원격(동기화된 전체 편집) 유지.
    editQueue:         localEditedIds.size > 0 ? local.editQueue : remoteState.editQueue,
    assigneeOverrides: { ...(remoteState.assigneeOverrides ?? {}), ...(local.assigneeOverrides ?? {}) },
    projectOrderMap:   { ...(remoteState.projectOrderMap ?? {}),   ...(local.projectOrderMap ?? {})   },
    projectMetaEdits:  { ...(remoteState.projectMetaEdits ?? {}),  ...(local.projectMetaEdits ?? {})  },
    execOrder:         Object.keys(local.execOrder ?? {}).length > 0 ? local.execOrder : remoteState.execOrder,
  }
}
