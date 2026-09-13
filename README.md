# AgentHeadroom

> 모든 AI 에이전트의 남은 작업 여유를 macOS 메뉴바와 Windows/Linux 시스템 트레이에서 한눈에.

[![CI](https://github.com/soil0119/AgentHeadroom/actions/workflows/ci.yml/badge.svg)](https://github.com/soil0119/AgentHeadroom/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/soil0119/AgentHeadroom)](https://github.com/soil0119/AgentHeadroom/releases/latest)

AgentHeadroom is a privacy-first, cross-platform tray app for comparing AI agent quotas across providers, accounts, and reset windows.

트레이 숫자를 클릭하면 공급자·계정·한도별 진행 막대, 가장 먼저 고갈될 한도, 시간순 리셋 일정을 한 팝오버에서 확인할 수 있습니다. 우클릭 메뉴는 빠른 관리 작업용으로 유지됩니다.

[Website](https://soil0119.github.io/AgentHeadroom/) · [Download](https://github.com/soil0119/AgentHeadroom/releases/latest) · [Adapter protocol](docs/adapter-spec.md)

## Why it is different

- macOS, Windows, Linux에서 동일한 공급자 모델과 어댑터 규격 사용
- 로그인 토큰, OS 자격 증명 저장소, 브라우저 쿠키를 직접 읽지 않음
- 공개 JSON 어댑터 규격으로 어떤 로컬 CLI나 사내 사용량 서비스도 연결
- 공식 조회 수단이 있는 공급자는 자동 동기화하고, 그 외에는 명시적으로 설치한 로컬 자동 어댑터 사용
- 수동 퍼센트 입력이나 추정값 없이 검증 가능한 자동 데이터만 표시
- 모든 공급자·계정·기간 중 **가장 먼저 고갈될 한도**를 트레이 숫자로 표시
- 트레이를 좌클릭하면 모든 활성 에이전트의 통합 사용량 팝오버 표시
- 리셋 예정 시간을 빠른 순서대로 표시
- 개인·팀·조직 등 여러 계정을 하나의 트레이에서 비교

## Built-in providers

| Provider | Mode | Notes |
|---|---|---|
| OpenAI Codex | Automatic | 설치되고 로그인된 Codex CLI의 app-server 사용 |
| Claude Code | Automatic | 설정에서 연결하면 공식 status-line 입력의 5시간·주간 한도를 자동 수집 |
| Gemini CLI | Automatic connector | 공식 `/stats model`의 안정적인 기계 판독 경로가 필요 |
| GitHub Copilot | Automatic connector | 개인·조직 Billing API 연결 대상 |
| Cursor | Automatic connector | 팀 Admin API 연결 대상; 개인 잔여 한도 API는 미공개 |
| Grok / Windsurf | Automatic connector | 공식 조회 인터페이스가 공개되면 활성화 |
| Any other agent | Local adapter | Adapter Protocol v1 자동 스냅샷만 허용 |

공식 API나 CLI 계약이 문서화되지 않은 서비스는 자동 로그인을 흉내 내거나 비공개 엔드포인트를 호출하지 않습니다.

## Platform support

| OS | Location | Release file |
|---|---|---|
| macOS | 화면 상단 메뉴바 | `AgentHeadroom-*-macOS-arm64.zip` 또는 `x64.zip` |
| Windows 10/11 x64 | 작업표시줄 오른쪽 아래 시스템 트레이 | `AgentHeadroom-*-Windows-x64.exe` |
| Linux x64 | 데스크톱 패널 시스템 트레이 | `AgentHeadroom-*-Linux-x86_64.AppImage` |

Windows에서 보이지 않으면 시계 옆 `^` 숨겨진 아이콘에서 AgentHeadroom을 바깥으로 드래그해 고정하세요. Linux는 AppIndicator 지원 데스크톱 환경이 필요합니다.

The downloadable builds are not notarized or commercially code-signed yet. macOS may require **Control-click → Open**, and Windows SmartScreen may show an unknown-publisher warning.

## Adapters and multiple accounts

Tray menu에서 **Open adapters folder**를 선택하고 신뢰하는 어댑터 manifest와 실행 파일을 넣으세요. 어댑터 하나가 여러 공급자와 여러 개인·팀 계정을 반환할 수 있습니다.

```text
Provider
├── Personal account
│   ├── 5-hour limit
│   └── Weekly limit
└── Team account
    └── Monthly limit
```

전체 형식과 보안 경계는 [Adapter Protocol v1](docs/adapter-spec.md)에 있으며, [manifest schema](docs/adapter-manifest.schema.json), [output schema](docs/adapter-output.schema.json), [`examples`](examples/)도 제공합니다.

## Build from source

```bash
git clone https://github.com/soil0119/AgentHeadroom.git
cd AgentHeadroom
npm ci
npm test
npm start
```

Build installers with `npm run dist:mac`, `npm run dist:win`, or `npm run dist:linux`. If Codex lives outside the standard path, set `AGENT_HEADROOM_CODEX_PATH=/absolute/path/to/codex`.

## Privacy and security

AgentHeadroom itself never reads authentication tokens, browser cookies, chat transcripts, or OS credential stores. Codex data comes through the locally installed Codex CLI. Local adapters are executable programs, so install only adapters you trust and review their own privacy disclosures.

No analytics are included.

### Claude Code automatic connection

설정에서 **Claude 자동 연결**을 누르면 AgentHeadroom이 `~/.claude/settings.json`의 빈 `statusLine` 슬롯에 가벼운 Node.js 브리지를 등록합니다. Claude Code가 첫 응답 후 공식적으로 전달하는 `rate_limits`만 로컬 스냅샷에 보관하며, transcript 경로·프롬프트·인증 정보는 저장하지 않습니다. 기존 status line이 있으면 덮어쓰지 않고 연결을 중단합니다. 연결 해제 시 AgentHeadroom이 추가한 설정·브리지·스냅샷만 제거합니다. Claude 자동 연결에는 `node` 실행 파일이 PATH에 있어야 합니다.

## Roomie

The tray mascot is **Roomie**, an original tiny robot whose color and expression reflect the tightest remaining quota. It does not reuse RunCat artwork, animation frames, name, or branding.

## License

[MIT](LICENSE)
