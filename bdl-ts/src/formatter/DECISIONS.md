# Formatter Decision Log

## 2026-02-17

### 1) 미구현 구문 지원 범위
- `Proc`, `Custom`, `Union`을 포맷터에서 지원한다.
- `ModuleLevelStatement`의 모든 타입이 포맷 가능해야 한다.

### 2) config 정책
- 기본 config는 `lineWidth=80`, `indent=space x2`로 유지한다.
- `formatBdl(text, config?)`로 config 오버라이드를 허용한다.
- 들여쓰기는 config 단위(`space/tab` + `count`)를 기준으로 블록 렌더링에 적용한다.

### 3) one-line 정책
- `oneof` one-line은 기존의 "코멘트 없음 + 항목 조건"을 유지한다.
- 추가로 최종 문자열의 마지막 줄 길이가 `lineWidth`를 초과하면 multi-line으로 강등한다.

### 4) 에러 메시지 정책
- 문자열 throw를 사용하지 않는다.
- 진입점에서 파싱 실패와 포맷 실패 메시지를 구분한다.

### 5) 테스트 정책
- statement별 회귀 테스트를 유지한다.
- 멱등성(`format(format(x)) == format(x)`) 테스트를 유지한다.
- config(`indent`, `lineWidth`) 동작 테스트를 유지한다.

## 2026-02-18

### 6) 블록 렌더링 공통화
- `enum`, `oneof`, `struct`, `union`, `union item struct`의 반복 렌더 루프를 `renderCollectedBlock`으로 통합한다.
- 블록 내 `above/after`(주석/개행) 처리 정책은 공통 로직 하나에서 적용한다.

### 7) collect 재탐색 완화
- trivia 스캔은 `parser.look(...)` 내부에서 수행해 `parser.loc` 외부 상태를 오염시키지 않는다.
- `collectNewlineAndComments(parser, loc)`는 마지막 조회 위치 단일 캐시를 사용한다.
- 캐시는 `formatBdl(text, { triviaCache })`로 on/off 비교 가능하게 유지한다.

### 8) 테스트 강화 기준
- statement 커버리지는 테스트 파일 내 `statementCoverageMatrix`로 추적한다.
- 멱등성 샘플은 최소 10개 이상 유지한다.
- 에지 케이스(쉼표 혼합, comment 조합, attribute 인접, lineWidth 경계, union 중첩)는 회귀 테스트로 고정한다.

### 9) 성능 측정 기준
- 벤치마크 엔트리는 `plain/comment-heavy` x `small/medium/large` x `cache-off/cache-on` 조합으로 유지한다.
- 측정 명령은 `deno bench bdl-ts/src/formatter/bdl.bench.ts`를 기준으로 통일한다.
- 2026-02-18 기준 샘플:
  - `formatter/plain/small`: off `807.4µs`, on `688.5µs`
  - `formatter/plain/large`: off `60.4ms`, on `58.0ms`
  - `formatter/comment-heavy/large`: off `18.9ms`, on `17.9ms`

### 10) 포맷 정책 요약
- 모듈 간 빈 줄은 최대 1개로 정규화한다.
- `oneof`는 코멘트가 없고 라인 폭을 넘지 않을 때만 one-line으로 유지한다.
- 블록형 선언(`enum/oneof/struct/union`)은 동일한 들여쓰기/후행 코멘트 정책(`renderCollectedBlock`)을 사용한다.
- Attribute는 `-` 콘텐츠는 한 줄, `|` 콘텐츠는 다음 줄 multiline으로 고정한다.
- `Proc`는 `=`/`->`/`throws` 경계를 기준으로 lineWidth 내에서 단계적으로 줄바꿈한다.
