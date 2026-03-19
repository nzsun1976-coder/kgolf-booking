# KGolf 부킹 앱 — 실제 운영 배포 가이드
**소요 시간: 약 45분 ~ 1시간**

---

## 전체 흐름

```
1단계: Firebase 설정   (데이터베이스 — 무료)
2단계: GitHub 설정     (코드 저장소 — 무료)
3단계: Vercel 배포     (웹 호스팅 — 무료)
4단계: Firebase 코드 연결
5단계: 모바일 PWA 설치 안내
```

---

## 1단계 — Firebase 설정 (데이터베이스)

### 1-1. Firebase 가입
1. 브라우저에서 **https://firebase.google.com** 접속
2. 오른쪽 위 **"시작하기"** 버튼 클릭
3. Google 계정으로 로그인 (Gmail 계정 사용)

### 1-2. 새 프로젝트 만들기
1. **"프로젝트 추가"** 클릭
2. 프로젝트 이름 입력: `kgolf-booking`
3. Google 애널리틱스: **"사용 안함"** 선택 → **"프로젝트 만들기"**
4. 완료되면 **"계속"** 클릭

### 1-3. Firestore 데이터베이스 만들기
1. 왼쪽 메뉴에서 **"Firestore Database"** 클릭
2. **"데이터베이스 만들기"** 클릭
3. 위치 선택: **australia-southeast1** (시드니, NZ와 가장 가까움)
4. 보안 규칙: **"테스트 모드에서 시작"** 선택 → **"만들기"**

> ⚠️ 테스트 모드는 30일 후 만료됩니다.
> 30일 후 아래 규칙으로 업데이트 필요:
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /kgolf/{document} {
>       allow read, write: if true;
>     }
>   }
> }
> ```

### 1-4. Firebase 설정 키 가져오기
1. 왼쪽 위 톱니바퀴(⚙️) 아이콘 → **"프로젝트 설정"**
2. 아래로 스크롤 → **"내 앱"** 섹션
3. 웹 아이콘(`</>`) 클릭
4. 앱 닉네임: `kgolf-web` 입력 → **"앱 등록"**
5. 아래와 같은 코드가 나타납니다 — **이걸 메모장에 복사해두세요**:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",           ← 이 값들을
  authDomain: "kgolf-.....",     ← 나중에
  projectId: "kgolf-...",        ← App.jsx에
  storageBucket: "kgolf-.....",  ← 붙여넣을
  messagingSenderId: "12345...", ← 겁니다
  appId: "1:12345:web:abcd...",
};
```

6. **"콘솔로 이동"** 클릭

---

## 2단계 — GitHub 설정 (코드 저장소)

### 2-1. GitHub 가입
1. **https://github.com** 접속
2. **"Sign up"** 클릭
3. 이메일, 비밀번호, 사용자명 입력 후 가입

### 2-2. 새 저장소(Repository) 만들기
1. 로그인 후 오른쪽 위 **"+"** 버튼 → **"New repository"**
2. Repository name: `kgolf-booking`
3. **"Public"** 선택
4. **"Create repository"** 클릭

### 2-3. 파일 업로드
이 가이드와 함께 제공된 압축 파일 안에 있는 파일들을 GitHub에 올려야 합니다.

**업로드할 파일 목록:**
```
kgolf-deploy/
├── package.json
├── vite.config.js
├── index.html
├── public/
│   └── manifest.json
└── src/
    ├── main.jsx
    └── App.jsx  ← Firebase 연결 후 업로드
```

**업로드 방법 (초보자용):**
1. 저장소 페이지에서 **"uploading an existing file"** 링크 클릭
2. 파일들을 드래그 앤 드롭
3. 하단 **"Commit changes"** 클릭

> 💡 폴더 구조가 중요합니다. `src` 폴더 안에 `App.jsx`와 `main.jsx`가, `public` 폴더 안에 `manifest.json`이 있어야 합니다.

---

## 3단계 — Vercel 배포 (웹 호스팅)

### 3-1. Vercel 가입
1. **https://vercel.com** 접속
2. **"Sign Up"** → **"Continue with GitHub"** 클릭
3. GitHub 계정으로 연동

### 3-2. 프로젝트 배포
1. Vercel 대시보드에서 **"Add New Project"** 클릭
2. GitHub 저장소 목록에서 **kgolf-booking** 선택 → **"Import"**
3. 설정은 기본값 그대로 → **"Deploy"** 클릭
4. 2~3분 기다리면 배포 완료!

### 3-3. URL 확인
배포가 완료되면 아래 형태의 URL이 생깁니다:
```
https://kgolf-booking-xxxx.vercel.app
```
이 URL이 바로 앱 주소입니다! 🎉

---

## 4단계 — Firebase 코드 연결

### 4-1. App.jsx 수정
다운로드받은 `src/App.jsx` 파일을 메모장이나 텍스트 편집기로 열고, 파일 맨 위 부분을 찾습니다:

```javascript
const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID",
};
```

**1단계 4번에서 복사해둔 값**으로 교체합니다:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain:        "kgolf-booking-xxxxx.firebaseapp.com",
  projectId:         "kgolf-booking-xxxxx",
  storageBucket:     "kgolf-booking-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdefxxxxxxxx",
};
```

파일 저장 후 GitHub에 다시 업로드하면 Vercel이 자동으로 재배포합니다.

### 4-2. 어드민 비밀번호 변경 (중요!)
`App.jsx`에서 아래 줄을 찾아서 비밀번호를 변경하세요:

```javascript
if (lf.email === "admin@kgolf.nz" && lf.pass === "admin123") {
```

`admin123` 부분을 원하는 비밀번호로 바꾸세요:

```javascript
if (lf.email === "admin@kgolf.nz" && lf.pass === "내가원하는비밀번호") {
```

---

## 5단계 — 모바일 PWA 설치 (앱처럼 사용)

### 고객에게 공유하는 방법
배포된 URL을 카카오톡이나 문자로 공유하면 됩니다.

### iPhone (iOS Safari)에서 설치
1. Safari로 앱 URL 접속
2. 하단 공유 버튼(□↑) 탭
3. **"홈 화면에 추가"** 탭
4. **"추가"** 탭

→ 앱 아이콘이 생성되고 앱처럼 실행됩니다!

### Android (Chrome)에서 설치
1. Chrome으로 앱 URL 접속
2. 주소창 오른쪽 메뉴(⋮) 탭
3. **"앱 설치"** 또는 **"홈 화면에 추가"** 탭

### PC에서 카운터 대시보드 접속
1. 브라우저로 앱 URL 접속
2. **admin@kgolf.nz** + 비밀번호로 로그인
3. 자동으로 카운터 대시보드로 이동

---

## 도메인 연결 (선택사항)

`kgolf.co.nz` 같은 도메인을 원하시면:

1. **https://www.godaddy.com** 이나 **https://www.domains.co.nz** 에서 도메인 구매 (연 NZD $15~30)
2. Vercel 대시보드 → 프로젝트 → **"Domains"** → 도메인 추가
3. GoDaddy DNS 설정에서 Vercel이 알려주는 값 입력

---

## 비용 요약

| 항목 | 비용 |
|------|------|
| Firebase (Spark 플랜) | **무료** (월 5만 건 읽기/쓰기) |
| Vercel (Hobby 플랜) | **무료** |
| GitHub | **무료** |
| 도메인 (선택) | NZD ~$20/년 |
| **합계** | **거의 무료** |

> 💡 KGolf 규모에서는 Firebase 무료 플랜으로 충분합니다. 하루 수백 건의 예약도 문제없습니다.

---

## 문제 해결

**앱이 안 열릴 때**
- Vercel 대시보드에서 배포 상태 확인
- "Functions" 탭에서 에러 로그 확인

**데이터가 저장 안 될 때**
- Firebase 콘솔 → Firestore → 규칙 탭에서 테스트 모드 확인
- App.jsx의 firebaseConfig 값이 올바른지 재확인

**도움이 필요하면**
Claude에게 에러 메시지를 그대로 붙여넣으면 해결해드릴 수 있습니다!
