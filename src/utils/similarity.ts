function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_\(\)（）,.\[\]]/g, '')
}

// 두 문자열의 유사도 (0~1) - Jaccard 문자 집합 + 포함 관계 복합
export function getSimilarityRatio(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  // 포함 관계: 짧은 쪽이 긴 쪽에 포함될 때
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) / Math.max(na.length, nb.length)
  }

  // Jaccard 문자 집합 유사도
  const setA = new Set(na.split(''))
  const setB = new Set(nb.split(''))
  let intersection = 0
  for (const c of setA) { if (setB.has(c)) intersection++ }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// 기본 70% 임계값으로 유사 여부 판단
export function isSimilar(a: string, b: string, threshold = 0.7): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false
  return getSimilarityRatio(a, b) >= threshold
}

// 두 프로젝트 간 중복 여부 검사 (이름↔이름, 발주처↔발주처, 이름↔발주처 교차 포함)
export function isProjectDuplicate(
  nameA: string, clientA: string,
  nameB: string, clientB: string,
): boolean {
  return (
    isSimilar(nameA, nameB) ||
    (!!clientA && !!clientB && isSimilar(clientA, clientB)) ||
    (!!clientA && isSimilar(nameB, clientA)) ||   // B 이름 ↔ A 발주처
    (!!clientB && isSimilar(nameA, clientB))        // A 이름 ↔ B 발주처
  )
}

export interface DuplicateInfo {
  projectId: string
  projectName: string
  executiveName: string
}
