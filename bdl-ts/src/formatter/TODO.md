# 포매터 TODO

검토 범위:
- `bdl-ts/src/formatter/bdl.ts`
- `bdl-ts/src/formatter/bdl.test.ts`
- `bdl-ts/src/formatter/bdl.bench.ts`
- `bdl-ts/src/formatter/DECISIONS.md`

현재 합의 반영:
- 잘못된 formatter config는 예외보다 기본값 보정(coerce) 정책으로 처리한다.
- 테스트는 케이스만 봐도 의도가 드러나도록 이름/구조를 정리한다.

## P0 - 정확성 및 안정성

- [x] 포매터 설정 입력값을 검증하고 정규화하기.
  - 이유: `resolveFormatConfig`가 현재는 가드 없이 값을 그대로 반영하고 있어(`bdl.ts:144`), `lineWidth <= 0`, `indent.count < 0` 같은 입력에서 비정상 동작이 생길 수 있음.
  - 해야 할 일:
    - `lineWidth`, `indent.type`, `indent.count`에 대한 명시적 검증 추가.
    - 잘못된 값은 예외 대신 기본값으로 보정(coerce)하도록 정책 확정.
    - 잘못된 config 입력 케이스 테스트 추가.
  - 완료 기준: 잘못된 config 처리 방식이 결정적(deterministic)이고 문서화되어 있으며 테스트로 보장됨.

- [x] 파서/포매터 오류 래핑 시 원본 오류 cause 보존하기.
  - 이유: `formatBdl`이 오류를 문자열로 래핑하면서(`bdl.ts:94-103`) cause/stack 맥락이 사라짐.
  - 해야 할 일:
    - `new Error(message, { cause: error })` 형태로 래핑.
    - parse 실패와 formatter 실패 메시지가 기존처럼 구분되는지 테스트 추가.
  - 완료 기준: 상위 오류 메시지는 안정적으로 유지되고 원본 cause를 추적할 수 있음.

- [x] 모든 statement 타입에 대해 width 경계 회귀 테스트 추가하기.
  - 이유: 일부 케이스는 경계 테스트가 충분하지만 statement 타입별 커버리지는 아직 고르지 않음(`bdl.test.ts`).
  - 해야 할 일:
    - import/struct/enum/union/proc/custom에 대해 `lineWidth == 렌더 길이`, `lineWidth - 1` 테스트 추가.
    - 각 statement 계열에 대해 trailing inline comment의 "코멘트 제외 폭 계산" 동작 테스트 추가.
  - 완료 기준: statement 타입별 oneline -> multiline 전환 경계가 모두 테스트로 고정됨.

- [ ] 테스트 케이스 의도를 한눈에 파악할 수 있게 정리하기.
  - 이유: 일부 케이스는 결과 문자열만으로는 검증 의도를 빠르게 이해하기 어려움(`bdl.test.ts`).
  - 해야 할 일:
    - `Deno.test` 이름을 "무엇을 검증하는지"가 드러나는 형태로 정리.
    - 의도가 즉시 보이지 않는 케이스에는 짧은 의도 설명(주석/소제목) 추가.
    - 케이스만으로 의도가 충분히 드러나는 경우에는 설명 생략.
  - 완료 기준: 신규 기여자가 테스트를 읽고 케이스 의도를 빠르게 파악할 수 있음.

- [x] 캐시 동등성 테스트 추가하기(`triviaCache: true` vs `false`).
  - 이유: 캐시 옵션은 존재하지만(`bdl.ts:36`, `bdl.ts:1402-1436`) 결과 동등성을 직접 검증하는 테스트가 없음.
  - 해야 할 일:
    - 대표 스키마 코퍼스를 구성해 두 캐시 모드 출력이 완전히 동일한지 검증.
  - 완료 기준: 캐시 옵션은 성능에만 영향을 주고 출력에는 영향을 주지 않음이 보장됨.

## P1 - 유지보수성

- [ ] `bdl.ts`를 책임 단위로 모듈 분리하기.
  - 이유: 포매터 구현이 단일 대형 파일(`bdl.ts`, 1600+ 라인)에 집중되어 있어 리뷰/리팩터링 비용이 큼.
  - 해야 할 일:
    - `collect/*`, `render/*`, `layout/*`, `statement/*` 단위로 분리.
    - 동작 변경 없이 이동 중심으로 진행.
  - 완료 기준: 역할별로 코드가 분리되고 기존 테스트가 그대로 통과함.

- [ ] 블록 oneline/multiline 결정 로직 중복 통합하기.
  - 이유: import/struct/oneof/enum/union/union-item-struct에서 collapse 체크와 후보 필터가 반복됨(`bdl.ts:173+`, `328+`, `463+`, `608+`, `961+`, `1157+`).
  - 해야 할 일:
    - source collapse 가능성, comment 제약, width 게이팅을 공통 헬퍼로 추출.
    - statement별 예외 규칙은 옵션으로 유지.
  - 완료 기준: 정책 변경 시 한 지점에서 일관되게 수정 가능함.

- [ ] item 수집(collect) 패턴 중복 줄이기.
  - 이유: `collectImportItems`, `collectOneofItems`, `collectEnumItems`, struct 계열 collector가 순회/주석 처리 로직을 반복함.
  - 해야 할 일:
    - "node + above + after" 형태를 위한 공통 collector 유틸 도입.
    - statement별 span 경계 계산은 콜백으로 분리.
  - 완료 기준: 수집 로직 중복이 줄고 테스트가 안정적으로 유지됨.

- [ ] `proc`/`custom`의 선언 앞 trivia 정책 통일하기.
  - 이유: `collectProc`, `collectCustom`은 `above: []`를 반환하지만 다른 선언은 leading trivia를 명시적으로 수집함(`bdl.ts:855+`, `940+`).
  - 해야 할 일:
    - 의도된 정책을 먼저 문서화.
    - 다른 선언과 정렬하거나, 예외로 유지하되 테스트로 고정.
  - 완료 기준: leading comment 처리 방식이 의도적으로 정의되고 문서/테스트로 보장됨.

- [x] 포매터 내부의 AST 계층 `Span` 의존성 제거하기.
  - 이유: 포매터는 주로 CST span을 다루는데 AST span 타입 import는 불필요한 결합을 만듦(`bdl.ts:1`, `bdl.ts:45`).
  - 해야 할 일:
    - 가능한 범위에서 `Span`을 로컬 포매터 span 타입(또는 `cst.Span`)으로 대체.
    - 외부 API는 변경하지 않기.
  - 완료 기준: 포매터 내부가 AST 모듈 형태에 의존하지 않음.

- [ ] `createSpanFormatter` 구현을 읽기 쉽게 단순화하기.
  - 이유: 현재 보간 루프는 `args[i - 1]` 오프셋 로직(`bdl.ts:1609-1637`)을 사용해 추론 난이도가 높음.
  - 해야 할 일:
    - `strings[i]` + 선택적 `args[i]` 흐름으로 단순한 루프로 재작성.
    - string/span/type-expression 혼합 보간 테스트 추가.
  - 완료 기준: 동작은 동일하고 구현 가독성이 향상됨.

## P2 - 성능 및 툴링

- [ ] 단일 엔트리 캐시를 넘어 trivia 캐시 전략 고도화하기.
  - 이유: 현재 캐시는 parser별 마지막 위치 1개만 저장해(`bdl.ts:1402-1436`) 큰 파일에서 hit rate가 제한적임.
  - 해야 할 일:
    - 작은 bounded map(예: `loc` 기준 고정 크기 LRU) 시도.
    - 기존 구현 대비 벤치마크로 효과 검증.
  - 완료 기준: 출력 동일성을 유지하면서 측정 가능한 성능 향상이 확인됨.

- [ ] 벤치마크 비교 스크립트와 기준선 리포트 추가하기.
  - 이유: `bdl.bench.ts`는 존재하지만 회귀 감지가 수동임.
  - 해야 할 일:
    - 핵심 케이스의 before/after 델타를 출력하는 task/script 추가.
    - 의미 있는 성능 저하 판단 기준(guardrail) 정의.
  - 완료 기준: 포매터 변경 시 성능 영향이 쉽게 가시화됨.

- [ ] 복합 모듈 케이스용 fixture 기반 golden 테스트 도입하기.
  - 이유: 현재 inline 문자열 테스트는 미세 케이스엔 좋지만, 긴 실전 스키마 리뷰에는 가독성이 떨어짐.
  - 해야 할 일:
    - 복합 시나리오용 fixture 파일(`input.bdl`, `expected.bdl`) 추가.
    - 기존 단위 테스트는 edge 동작 검증용으로 유지.
  - 완료 기준: 대형 포맷 결과를 fixture 기반으로 쉽게 검토/회귀 검증 가능.
