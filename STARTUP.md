# Where To? - Startup Guide

## Prerequisites

- Node.js 20+
- Claude API key from [Anthropic Console](https://console.anthropic.com/)
- Google Maps API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with the Maps JavaScript and Places APIs enabled

## Quick Start

```bash
npm install
cp .env.example .env.local   # then fill in both keys
npm run dev
```

Open http://localhost:3000/where-to. The app uses `basePath: "/where-to"` so it can be served under that path on the portfolio site; the filter endpoint is `POST /where-to/api/filter`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run lint` | Lint |
| `npm run eval` | Evaluate prompt styles against Claude (real API calls) |
| `npm run eval:dry` | Preview eval cases without API calls |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Claude API key (server only) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | — | Google Maps key (exposed to the browser; restrict it by HTTP referrer) |
| `PROMPT_STYLE` | `pattern` | Filter prompt style: `pattern`, `minimal`, `primary`, `verbose` |

## Deployment

Deployed as its own Vercel project from this repo. The portfolio site rewrites `/where-to` and `/where-to/:path*` to that deployment, so the app appears at `<portfolio>/where-to`.
