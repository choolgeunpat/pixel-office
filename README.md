# 🏢 Pixel Office

**Claude Code 세션이 일하는 모습을 픽셀 오피스로 실시간 확인하세요.**

기획 · 개발 · 테스트 · 마케팅 · 디자인 · 리뷰, 여섯 명의 팀원(서브에이전트)에게 각자 책상이 있습니다. 팀장(Claude)이 일을 나눠 주면 팀원이 출근해서 자리에 앉아요. 지금 어떤 파일을 읽는지, 어떤 명령을 실행하는지 말풍선으로 보여 주고, 화이트보드에는 할 일 목록이 실시간으로 올라갑니다. 클라우드 세션(claude.ai/code)과 로컬 Claude Code 모두에서 동작합니다.

![Pixel Office](docs/screenshot.png)

| 화면 | 의미 |
|---|---|
| 🚪 문으로 들어와 자리로 걸어감 | 서브에이전트에게 일이 맡겨짐 |
| ⌨️ 서서 타이핑 + 모니터에 코드·터미널·브라우저 | 도구 사용 중 (Read, Edit, Bash, WebSearch …) |
| 🪑 앉아 있음 | 생각 중 / 대기 |
| 🎉 기뻐함 · 😢 시무룩 | 작업 완료 · 도구 실패 |
| 💤 졸고 있음 → 퇴근 | 오래 쉬는 중 |
| 📋 화이트보드 | TodoWrite 할 일 목록 |
| 📺 TV | 근무 인원, 도구 사용 횟수, 위임 횟수, 경과 시간 |
| ✈️ 종이비행기 | 팀장이 업무를 위임하는 순간 |

## 동작 원리

```
Claude Code 세션 ──(hooks)──▶ Pixel Office 서버 ──(SSE)──▶ 브라우저의 픽셀 오피스
  .claude/hooks/pixel-office.sh      /api/r/<사무실키>/events      /r/<사무실키>
```

- Claude Code의 [hooks](https://code.claude.com/docs/en/hooks)가 이벤트(프롬프트, 도구 사용 전·후, 서브에이전트 시작·종료, 알림, 종료)마다 작은 스크립트를 실행하고, 스크립트가 이벤트를 서버로 보냅니다.
- 서브에이전트 안에서 발생한 이벤트에는 `agent_type`이 들어 있어서, 그 이름(planner, developer, Explore, `my-plugin:reviewer` …)을 보고 알맞은 책상을 고릅니다.
- 서버는 의존성이 없는 Node 서버(파일 2개)입니다. 사무실마다 최근 이벤트 3000개를 메모리에 보관합니다.

---

## 빠른 시작 (5분)

### 1. 서버 띄우기 (한 번만)

클라우드 세션은 인터넷 어딘가에 있는 서버로 이벤트를 보내야 합니다. 아래 중 하나를 고르세요.

**A. Render (무료, 클릭 몇 번)**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/choolgeunpat/pixel-office)

이 저장소를 fork했다면 위 링크의 `repo=` 부분을 내 fork 주소로 바꾸세요. 배포가 끝나면 `https://pixel-office-xxxx.onrender.com` 같은 주소가 생깁니다.
> 무료 플랜은 15분 동안 요청이 없으면 잠듭니다. 잠든 상태에서 들어온 첫 이벤트 몇 개는 깨어나는 동안 놓칠 수 있어요.

**B. Docker (내 서버 / Fly.io / Railway 등)**

```bash
docker build -t pixel-office .
docker run -d -p 8787:8787 -e DATA_DIR=/data -v pixel-office:/data pixel-office
```

**C. 내 컴퓨터 + 터널 (설치 없이 바로 체험)**

```bash
npm start
```

```bash
npx cloudflared tunnel --url http://localhost:8787
```

터널이 알려 주는 `https://….trycloudflare.com` 주소를 서버 주소로 쓰면 됩니다. 단, 이 주소는 터널을 다시 켤 때마다 바뀝니다.

### 2. 내 사무실 만들기

서버 주소를 열고 **내 사무실 만들기**를 누르면 `https://<서버>/r/<사무실키>` 형태의 개인 주소가 생깁니다. 사무실 키는 무작위 24자이고, 이 주소를 아는 사람만 사무실을 볼 수 있어요. 화면의 **⚙ 연결 방법** 버튼을 누르면 내 주소가 이미 들어간 설치 안내가 나옵니다.

### 3. 프로젝트 저장소에 설치

보고 싶은 프로젝트 저장소의 루트에서 실행합니다.

```bash
curl -fsSL https://<서버>/install.sh | bash -s -- --team-guide
```

설치되는 파일:

- `.claude/hooks/pixel-office.sh`: 이벤트를 서버로 보내는 스크립트 (`PIXEL_OFFICE_URL`이 없으면 아무것도 안 함)
- `.claude/settings.json`: hook 11개 추가 (기존 설정과 다른 hook은 그대로 유지)
- `.claude/agents/{planner,developer,tester,marketer,designer,reviewer}.md`: 6명의 팀원
- `CLAUDE.md`: `--team-guide`를 붙였을 때만 추가되는 "팀원에게 나눠 맡기기" 안내 (권장)

여러 번 실행해도 결과가 같고, `--uninstall`로 설치한 것을 전부 지울 수 있습니다. 클라우드 세션은 저장소를 새로 받아서 시작하므로 **설치한 파일을 커밋하고 푸시**하세요.

```bash
git add .claude CLAUDE.md && git commit -m "chore: add Pixel Office" && git push
```

### 4. 세션에 사무실 주소 알려 주기

**☁️ 클라우드 세션 (claude.ai/code)**

세션 상단의 환경 메뉴 → **Edit**으로 들어갑니다.

1. **Environment variables**에 추가합니다:
   ```
   PIXEL_OFFICE_URL=https://<서버>/r/<사무실키>
   ```
2. **Network access**에서 Limited(또는 Custom)를 고르고, **Allowed domains**에 서버 도메인(예: `pixel-office-xxxx.onrender.com`)을 추가합니다.

자세한 내용은 [Cloud environments 문서](https://code.claude.com/docs/en/cloud-environments#network-access)를 참고하세요.

**💻 내 컴퓨터**

```bash
export PIXEL_OFFICE_URL="https://<서버>/r/<사무실키>"
```

### 5. 새 세션 시작

그 환경에서 새 세션을 열고 일을 시키면 팀원들이 출근합니다. 왼쪽 세션 목록에서 원하는 세션을 고를 수 있고, 클라우드 세션이면 **열기 ↗**를 눌러 claude.ai의 해당 세션으로 바로 이동할 수 있어요.

---

## 플러그인으로 설치하기 (로컬 Claude Code)

저장소 파일을 건드리지 않고 내 Claude Code에만 설치할 수도 있습니다.

```
/plugin marketplace add choolgeunpat/pixel-office
/plugin install pixel-office@pixel-office
```

플러그인에는 같은 hook과 6명의 팀원(`pixel-office:planner` …)이 들어 있습니다. `PIXEL_OFFICE_URL` 환경 변수는 따로 설정해야 해요. 클라우드 세션에는 위의 `install.sh` 방식을 권장합니다.

## 팀 구성과 책상 배정

| 책상 | 기본 에이전트 | 이런 이름도 이 책상으로 |
|---|---|---|
| 기획 Planner | `planner` | plan, Plan, Explore, research, spec, architect |
| 개발 Developer | `developer` | dev, engineer, builder, general-purpose, frontend, backend |
| 테스트 Tester | `tester` | test, qa, debug, verify, validator |
| 마케팅 Marketer | `marketer` | marketing, copy, seo, content, writer |
| 디자인 Designer | `designer` | design, ui, ux, art |
| 리뷰 Reviewer | `reviewer` | review, security, audit |
| 팀장 Claude | (메인 대화) | 서브에이전트가 아닌 모든 활동 |

어느 키워드에도 맞지 않는 이름은 이름을 기준으로 여섯 책상 중 하나에 고정 배정됩니다. 배정 규칙은 [`public/lib/roles.js`](public/lib/roles.js)에 있어요. 캐릭터는 [pixel-distric](https://github.com/choolgeunpat/pixel-distric)의 남녀 캐릭터를 팔레트만 바꿔 사용합니다.

## 개인정보 · 보안

- **보내는 것:** 이벤트 종류, 도구 이름, 대상(파일 경로 뒤 두 단계, 명령 설명, 검색어), 프롬프트 앞부분, 할 일 목록, 서브에이전트 이름.
- **보내지 않는 것:** 파일 내용, 수정 내용(diff), 도구 실행 결과. hook 스크립트가 보내기 전에 지우고, 서버가 한 번 더 잘라 냅니다. 서버는 원본 페이로드를 저장하지 않습니다.
- **사무실 키:** 키가 곧 비밀번호입니다. 공개 저장소에 커밋하지 말고 환경 변수로만 넣으세요.
- **내 서버 잠그기:** `PIXEL_OFFICE_ROOMS=키1,키2`를 설정하면 그 사무실만 이벤트를 받습니다.
- **Claude를 방해하지 않음:** hook은 비동기로 실행되고, 실패해도 항상 0으로 종료합니다. 서버가 꺼져 있어도 세션은 평소처럼 동작합니다.

## 서버 설정

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 포트 |
| `HOST` | `0.0.0.0` | 바인드 주소 |
| `DATA_DIR` | (없음) | 지정하면 사무실 기록을 `rooms.json`으로 저장 (1분마다, 그리고 종료할 때) |
| `PIXEL_OFFICE_ROOMS` | (없음) | 이벤트를 받을 사무실 키 목록 (쉼표로 구분) |

API: `POST /api/r/:key/events`(hook JSON 하나 또는 배열), `GET /api/r/:key/stream`(SSE), `GET /api/r/:key/events?since=`, `DELETE /api/r/:key`, `GET /healthz`.

## 개발

```bash
npm run dev
```

```bash
npm test
```

kit/를 고친 뒤에는 아래 명령으로 `kit/install.sh`와 `plugin/`을 다시 생성하세요. 생성 결과가 최신이 아니면 `npm test`가 실패합니다.

```bash
npm run build:kit
```

```
server/          Node 서버 (의존성 없음)
public/          웹 앱 (빌드 없음, ES modules)
  lib/           이벤트 정규화 · 역할 배정 · 오피스 상태 (서버와 공유)
  office/        픽셀 아트 씬, 캐릭터 스프라이트 런타임
kit/             hook 스크립트, 팀원 에이전트, 설치 스크립트 원본
plugin/          Claude Code 플러그인 (생성됨)
test/            node --test
```

데모(`/demo`)는 서버 없이 브라우저 안에서 실제 hook 형식의 이벤트를 만들어 보여 줍니다.

## 라이선스

MIT. 캐릭터 스프라이트는 [pixel-distric](https://github.com/choolgeunpat/pixel-distric)에서 가져왔고, 픽셀 폰트는 [Galmuri](https://github.com/quiple/galmuri)(SIL OFL 1.1)를 사용합니다.

---

### English (short)

Pixel Office streams a Claude Code session into a live pixel-art office: six subagent desks (planner, developer, tester, marketer, designer, reviewer) plus the lead.

1. Deploy the zero-dependency server (Render button, Docker, or `npm start` + a tunnel).
2. Open it and click "내 사무실 만들기" to get a private room URL.
3. Run `curl -fsSL https://<server>/install.sh | bash -s -- --team-guide` in your repo, then commit `.claude/`.
4. Set `PIXEL_OFFICE_URL=https://<server>/r/<room>` in your cloud environment (and allow the domain), or export it locally.
5. Start a session and watch the team work.
