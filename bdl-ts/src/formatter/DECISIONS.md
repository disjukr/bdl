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
