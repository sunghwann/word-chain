# 끝말잇기

문서 화면처럼 생긴 끝말잇기 게임입니다.

- **컴퓨터 대결**: 하수 · 중수 · 고수
- **1:1 대결**: 친구와 입장 코드로 실시간 대결
- **랭킹**: 친구들 기록을 실시간으로 집계
- 국어사전 표제어 약 33만 개로 단어 확인, 두음법칙 지원, 고유명사는 인정 기능으로 통과

컴퓨터 대결은 바로 됩니다. **랭킹과 1:1 대결**을 쓰려면 아래 Firebase 설정을 한 번 해 주세요(무료).

---

## Firebase 설정 (약 10분)

1. https://console.firebase.google.com 에 Google 계정으로 들어가 **프로젝트 추가**를 누릅니다.
   이름은 아무거나(예: `word-chain`) 정하고, Google 애널리틱스는 꺼도 됩니다.
2. 왼쪽 메뉴 **빌드 → Authentication → 시작하기**를 누르고,
   **로그인 방법** 탭에서 **익명**을 골라 **사용 설정 → 저장**합니다.
3. 같은 Authentication의 **설정 → 승인된 도메인**에서 **도메인 추가**를 누르고
   `sunghwann.github.io` 를 넣습니다.
4. 왼쪽 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**를 누릅니다.
   위치는 `asia-northeast3 (서울)`, 모드는 **프로덕션 모드**로 고릅니다.
5. Firestore의 **규칙** 탭을 열고, 내용을 전부 지운 뒤 이 저장소의
   [`firestore.rules`](firestore.rules) 내용을 붙여넣고 **게시**합니다.
6. 왼쪽 위 톱니바퀴 **프로젝트 설정 → 일반 → 내 앱**에서 웹 아이콘(`</>`)을 누릅니다.
   앱 이름을 정하고 등록하면 `firebaseConfig = { apiKey: ..., ... }` 값이 나옵니다.
7. 그 값을 [`firebase-config.js`](firebase-config.js)의 빈칸에 옮겨 적고 커밋합니다.
   (이 값은 웹 앱에 원래 공개되는 값이라 저장소에 올려도 괜찮습니다. 데이터는 5번의 규칙이 지킵니다.)

몇 분 뒤 페이지를 새로 고치면 오른쪽 아래 상태 표시줄에 **온라인**이 뜹니다.

## GitHub Pages

저장소 **Settings → Pages**에서 Source를 **Deploy from a branch**, 브랜치를 `main` / `(root)`로 두면
`https://sunghwann.github.io/word-chain/` 에서 열립니다.

## 파일

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 |
| `app.js` | 게임 로직, 랭킹, 1:1 대결 |
| `firebase-config.js` | Firebase 설정값 (직접 입력) |
| `firestore.rules` | Firestore 보안 규칙 |
| `words.bin` | 사전 데이터 (gzip) |

사전 데이터: [acidsound/korean_wordlist](https://github.com/acidsound/korean_wordlist), 자주 쓰는 단어 목록은 [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)(CC BY-SA 4.0)를 가공했습니다.
