# CodexHeadroom

> Codex 잔여 사용량을 macOS 메뉴바에서 바로 확인하세요.

[![CI](https://github.com/soil0119/CodexHeadroom/actions/workflows/ci.yml/badge.svg)](https://github.com/soil0119/CodexHeadroom/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/soil0119/CodexHeadroom)](https://github.com/soil0119/CodexHeadroom/releases/latest)

CodexHeadroom is a tiny, native macOS menu bar app that shows your remaining Codex usage as a percentage.

[Website](https://soil0119.github.io/CodexHeadroom/) · [Download](https://github.com/soil0119/CodexHeadroom/releases/latest)

There are already capable Codex usage widgets. CodexHeadroom deliberately focuses on one job: a Korean-first, one-number menu bar indicator with no token-file parsing, account switching, telemetry, or dashboard clutter.

## What it shows

- 메뉴바에 현재 남은 사용량을 `82%`처럼 표시
- 클릭하면 5시간/주간 한도와 리셋 시각 확인
- 60초마다 자동 갱신 + 수동 새로고침
- 별도의 API 키나 계정 토큰 저장 없음
- Codex CLI의 로컬 app-server 인터페이스 사용

## Requirements

- macOS 13 Ventura or later
- Apple Silicon Mac (prebuilt release)
- [Codex CLI](https://developers.openai.com/codex/cli) installed and signed in

## Install

1. Download the latest `CodexHeadroom-*-macOS-arm64.zip` from [Releases](../../releases/latest).
2. Unzip it and move `CodexHeadroom.app` to `Applications`.
3. Open the app. The remaining percentage appears in the menu bar.

The downloadable build is ad-hoc signed, not notarized. On first launch, macOS may require **Control-click → Open**.

## Build from source

```bash
git clone https://github.com/soil0119/CodexHeadroom.git
cd CodexHeadroom
swift test
./scripts/build-app.sh
open dist/CodexHeadroom.app
```

If your Codex executable lives elsewhere, launch with `CODEX_METER_CODEX_PATH=/path/to/codex`.

## Privacy

CodexHeadroom does not read or store your authentication token. It asks the locally installed Codex CLI for the same rate-limit snapshot used by Codex clients. No analytics are included.

## Status

This is an early side-project release. The Codex app-server protocol is currently experimental, so a future Codex CLI update may require a compatibility update.

## License

[MIT](LICENSE)
