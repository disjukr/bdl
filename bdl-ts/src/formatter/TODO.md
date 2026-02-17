# bdl-ts/src/formatter 개선 TODO

## 문서 목적
- 이 문서는 `bdl-ts/src/formatter`의 현재 구현을 기준으로, 포맷터를 "기능 완성 + 안정화 + 유지보수 가능한 구조"로 끌어올리기 위한 상세 작업 목록이다.
- 단기적으로는 미구현 구문(`Proc`, `Custom`, `Union`) 지원과 신뢰성 확보에 집중하고, 중기적으로는 아키텍처/테스트/성능을 정리한다.

## 진행 현황 (2026-02-17 기준)
- 대략 70~75% 진행
- P0: 대부분 완료
- P1: 부분 완료
- P2: 부분 완료 (핵심 테스트 보강 완료, 매트릭스/일부 에지케이스 보강 필요)
- P3: 부분 완료

## 범위
- 포함: `bdl-ts/src/formatter/bdl.ts`, `bdl-ts/src/formatter/bdl.test.ts`
- 연관 확인 대상: `bdl-ts/src/generated/cst.ts`, `bdl-ts/src/parser/bdl/cst-parser.ts`
- 제외(별도 트랙): CLI/에디터 플러그인 연동, 전체 프로젝트 린트 체계 정비

## 현재 상태 요약
- 모듈 레벨 포맷팅에서 `Proc`, `Custom`, `Union`이 `throw "TODO"`로 남아 있어 실제 문법 커버리지가 불완전함.
- `FormatConfig`(`lineWidth`, `indent`)가 선언되어 있지만 실질적으로 일부만 사용되거나 하드코딩(`d(2)`)에 묶여 있음.
- `enum`, `oneof`, `struct`에서 블록/속성 렌더링 로직이 유사하게 반복되어 수정 시 누락 위험이 큼.
- 주석/개행 수집 함수가 잦은 재탐색을 수행해 큰 입력에서 비효율 가능성이 있음.
- 테스트는 핵심 케이스가 있으나, 미구현 구문/에지 케이스/멱등성(idempotency) 검증이 부족함.

---

## P0 (최우선) - 기능 완성과 실패 방지

### 1) 미구현 구문 포맷팅 완료
- [x] `formatProc`, `collectProc` 구현
  - 포맷 규칙 정의: `proc Name = InputType -> OutputType [throws ErrorType]`
  - `throws` 존재/부재 모두 처리
  - 토큰 사이 주석(`keyword`, `name`, `eq`, `arrow`, 타입 경계) 유지 규칙 확정
  - **완료 기준**: `Proc`만 포함된 입력이 예외 없이 포맷되고, 주석 손실이 없음
- [x] `formatCustom`, `collectCustom` 구현
  - 포맷 규칙 정의: `custom Name = OriginalType`
  - `TypeExpression` 컨테이너(`[]`) 포함 케이스 점검
  - **완료 기준**: `Custom` 관련 테스트 통과 + 타입 문자열 왜곡 없음
- [x] `formatUnion`, `collectUnion`, `collectUnionItems` 구현
  - `UnionItem` 단순형/인라인 struct(`UnionItemStruct`) 모두 처리
  - `UnionItemStruct` 내부는 `StructBlockStatement` 규칙 재사용
  - inline comment / block comment 보존
  - **완료 기준**: 중첩 struct가 있는 union 파일도 안정적으로 포맷됨

### 2) 예외 처리 및 안전장치 정리
- [x] `throw "TODO"`를 `Error` 기반 예외로 교체
  - 최소한 `new Error("Formatter: unsupported statement ...")` 형태로 통일
  - 문자열 throw 금지
  - **완료 기준**: 포맷 실패 시 에러 타입/메시지가 일관됨
- [x] 포맷터 진입점 예외 메시지 개선
  - 파싱 실패와 포맷 실패를 구분 가능한 메시지로 분리
  - 필요 시 span/근처 텍스트를 포함해 디버깅 가능성 강화
  - **완료 기준**: 실패 재현 시 원인 지점 파악이 가능한 로그 확보

### 3) config 실제 적용
- [x] `formatBdl(text, config?)` 시그니처로 config 주입 가능하게 확장
  - 기본값 병합 로직 작성 (`lineWidth=80`, `indent=2 spaces`)
  - 외부에서 indentation 정책을 바꿀 수 있게 반영
- [x] 하드코딩된 `d(2)` 제거 또는 config 기반으로 대체
- [x] one-line 배치 기준(`oneof` oneliner)에서 `lineWidth` 실제 활용
  - 단순 항목 개수(`<5`) 기준을 길이 기반 판단으로 전환
- **완료 기준**: config 변경 시 결과 문자열이 일관되게 달라짐

---

## P1 - 구조 개선(중복 제거, 유지보수성 향상)

### 4) 렌더링 공통화
- [ ] 공통 블록 렌더러 추출
  - 대상: `enum`, `oneof`, `struct`의 반복 루프
  - 입력: `nodes`, `after`, 렌더 콜백
  - 출력: 들여쓰기/개행/후행 주석 정책이 동일하게 적용된 문자열
- [x] Attribute 렌더링 단일화
  - 현재 분산된 `Attribute` 출력 분기를 단일 함수로 통합
  - `-`/`|` content 규칙을 한 곳에서 관리
  - **완료 기준**: Attribute 포맷 코드 중복이 제거되고 동작 동일

### 5) 수집(collect) 계층 정리
- [ ] `collect*` 함수의 역할을 "토큰 간 주석/개행 추출"로 제한
- [ ] 렌더 로직이 `collect*` 내부 상태(`parser.loc`)에 과도하게 의존하지 않게 정리
- [ ] `collectFollowingComment` 재탐색 최소화
  - TODO(`just collect once`) 해결
  - 동일 구간 반복 스캔 최소화
  - **완료 기준**: 주석 수집 흐름이 함수 단위로 추적 가능하고 중복 호출 감소

### 6) 유틸 함수 정비
- [x] 사용되지 않는 `depth()` 제거 여부 결정
- [x] `d`, `f` 네이밍 개선 (의도 드러나는 이름으로 변경)
  - 예: `indentLines`, `formatSpanTemplate`
- [ ] `f` 템플릿 함수의 타입 정의 명확화
  - `false | undefined` 처리 정책 문서화
  - **완료 기준**: 유틸 함수 이름만 보고 동작을 이해할 수 있음

---

## P2 - 테스트 강화(회귀 방지)

### 7) 구문 커버리지 매트릭스 확보
- [ ] 테스트 파일에 statement coverage 표 추가(주석으로 관리)
  - `Attribute/Import/Struct/Oneof/Enum/Proc/Custom/Union`
  - 각 statement별 "기본/주석 포함/edge" 3종 이상
- [x] 미구현이었던 `Proc/Custom/Union` 테스트 우선 추가
  - **완료 기준**: 모든 ModuleLevelStatement 타입에 테스트 존재

### 8) 멱등성(idempotency) 테스트
- [x] `formatBdl(formatBdl(input)) === formatBdl(input)` 검증 케이스 추가
- [ ] 최소 10개 이상의 혼합 입력 샘플 구성
  - 주석 다량
  - 빈 줄 다량
  - 타입 컨테이너 혼합
  - **완료 기준**: 포맷 재적용 시 출력이 안정적으로 고정됨

### 9) 에지 케이스/회귀 테스트
- [ ] trailing comma 유무 혼합 케이스
- [ ] inline comment + 다음 줄 block comment 조합
- [ ] multiline attribute(`|`)와 일반 attribute(`-`) 인접 배치
- [ ] one-line vs multi-line 경계 케이스(lineWidth 근처)
- [ ] union 내부 struct + attribute 중첩 케이스
- [ ] **완료 기준**: 과거 버그/예상 취약 케이스를 테스트로 고정

---

## P3 - 성능 및 운영 품질

### 10) 성능 측정 기반 개선
- [x] 기준 입력 세트 준비
  - 작은 파일(수십 줄), 중간 파일(수백 줄), 큰 파일(수천 줄)
- [x] 포맷 시간/메모리 사용량을 간단히 측정하는 스크립트 또는 테스트 작성
- [ ] 병목 후보 점검
  - 반복 `collectNewlineAndComments` 호출
  - 문자열 `split/join/trim` 반복
  - generator -> array 변환 비용
- [ ] **완료 기준**: 개선 전/후 수치 비교 가능

### 11) 결정 기록(Decision Log) 남기기
- [x] 포맷 정책(예: 한 줄 배치 조건, 빈 줄 최대 개수, 주석 결합 방식)을 문서화
- [x] 정책 변경 시 테스트와 함께 기록
- [ ] **완료 기준**: 신규 기여자가 포맷 정책을 코드 추측 없이 이해 가능

---

## 실행 순서 제안
1. P0-1(미구현 구문) -> P0-2(예외 처리) -> P0-3(config 적용)
2. P1-4/5/6(구조 정리)
3. P2-7/8/9(테스트 확장)
4. P3-10/11(성능/운영 품질)

## 완료 정의(Definition of Done)
- [x] `ModuleLevelStatement` 전 타입 포맷 지원
- [x] 포맷터 실행 중 문자열 throw 제거
- [x] config(`lineWidth`, `indent`)이 출력에 실질 반영
- [ ] 테스트에서 구문 커버리지 + 멱등성 검증 완료
- [x] 리팩터링 후에도 기존 테스트와 신규 테스트 모두 통과

## 메모
- 큰 리팩터링(P1) 전에는 반드시 P0 테스트를 먼저 보강해 회귀 안전망을 확보한다.
- 버그 수정 작업에서는 동작 변경 범위를 최소화하고, 정책 변경은 테스트/문서와 함께 진행한다.
