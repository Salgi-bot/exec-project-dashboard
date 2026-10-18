import { FileImportButton } from '@/components/shared/FileImportButton'

// 데이터(시트)가 없을 때의 첫 화면.
// ★2026-10-18: 종전엔 여기서 비밀번호 없이 엑셀을 고를 수 있었다(가져오기 = 모든 사용자 데이터 교체).
//   상단 「파일 변경」과 같은 관리자 비밀번호 확인을 거치도록 FileImportButton 을 쓴다.
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-96">
      <div className="border-2 border-dashed border-blue-300 rounded-2xl p-12 text-center max-w-md">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">표시할 데이터가 없습니다</h3>
        <p className="text-gray-500 text-sm mb-4">
          잠시 뒤 새로고침해 보세요. 처음 설정할 때만<br />관리자가 진행일정표 .xlsx 파일을 가져옵니다.
        </p>
        <div className="flex justify-center"><FileImportButton /></div>
      </div>
    </div>
  )
}

// 필터·검색 결과가 0건일 때. 가져오기를 띄우지 않는다(종전엔 이때도 비밀번호 없는 가져오기가 떴다).
export function NoResults() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-96 text-center">
      <div className="text-5xl mb-3">🔍</div>
      <h3 className="text-lg font-semibold text-gray-700 mb-1">조건에 맞는 프로젝트가 없습니다</h3>
      <p className="text-gray-500 text-sm">위쪽의 임원 선택·검색어·숨김 설정을 바꿔 보세요.</p>
    </div>
  )
}
