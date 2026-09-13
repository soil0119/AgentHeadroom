# AgentHeadroom

> 모든 AI 에이전트의 남은 작업 여유를 macOS 메뉴바와 Windows/Linux 시스템 트레이에서 한눈에.

[![CI](https://github.com/soil0119/AgentHeadroom/actions/workflows/ci.yml/badge.svg)](https://github.com/soil0119/AgentHeadroom/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/soil0119/AgentHeadroom)](https://github.com/soil0119/AgentHeadroom/releases/latest)

AgentHeadroom is a privacy-first, cross-platform tray app for comparing AI agent quotas across providers, accounts, and reset windows.

[Website](https://soil0119.github.io/AgentHeadroom/) · [Download](https://github.com/soil0119/AgentHeadroom/releases/latest) · [Adapter protocol](docs/adapter-spec.md)

## Why it is different

- macOS, Windows, Linux에서 동일한 공급자 모델과 어댑터 규격 사용
- 로그인 토큰, OS 자격 증명 저장소, 브라우저 쿠키를 직접 읽지 않음
- 공개 JSON 어댑터 규격으로 어떤 로컬 CLI나 사내 사용량 서비스도 연결
- 공식 조회 수단이 있는 공급자는 자동 동기화하고, 없는 공급자는 로컬 어댑터 또는 수동 기록
- 모든 공급자·계정·기간 중 **가장 먼저 고갈될 한도**를 트레이 숫자로 표시
- 리셋 예정 시간을 빠른 순서대로 표시
- 개인·팀·조직 등 여러 계정을 하나의 트레이에서 비교

## Built-in providers

| Provider | Mode | Notes |
|---|---|---|
| OpenAI Codex | Automatic | 설치되고 로그인된 Codex CLI의 app-server 사용 |
| Claude Code | Manual / adapter | 공식 사용량 화면 바로가기 포함 |
| Grok | Manual / adapter | Settings → Usage 바로가기 포함 |
| Gemini CLI | Manual / adapter | 사용량/플랜 화면 바로가기 포함 |
| GitHub Copilot | Manual / adapter | Billing 화면 바로가기 포함 |
| Cursor | Manual / adapter | Dashboard 바로가기 포함 |
| Windsurf | Manual / adapter | Plan 관리 화면 바로가기 포함 |
| Any other agent | Manual / adapter | 이름과 HTTPS 사용량 URL을 직접 추가 |

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

AgentHeadroom itself never reads authentication tokens, browser cookies, chat transcripts, or OS credential stores. Codex data comes through the locally installed Codex CLI. Manual values stay in the app's local data directory. Local adapters are executable programs, so install only adapters you trust and review their own privacy disclosures.

No analytics are included.

## Roomie

The tray mascot is **Roomie**, an original tiny robot whose color and expression reflect the tightest remaining quota. It does not reuse RunCat artwork, animation frames, name, or branding.

## License

[MIT](LICENSE)
