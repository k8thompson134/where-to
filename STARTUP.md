# Where To? - Startup Guide

## Prerequisites

- Node.js 20+
- Claude API key from [Anthropic Console](https://console.anthropic.com/)
- Google Maps API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with these APIs enabled: Maps JavaScript API, Places API (New), Routes API, Geocoding API

## Quick Start

```bash
npm install
cp .env.example .env.local   # then fill in both keys
npm run dev
```

Open http://localhost:3000. The filter endpoint is `POST /api/filter`.

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
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | `DEMO_MAP_ID` | Map ID for the map; required by the route's stop markers (Advanced Markers). Create one under Google Maps Platform → Map Management |
| `PROMPT_STYLE` | `primary` | Filter prompt style: `primary`, `pattern`, `minimal`, `verbose`, `fewshot`, `fewshot2` (compare with `npm run eval`) |

## Deployment

Deployed as its own Vercel project from this repo at https://whereto.k8thompson.dev. The portfolio's `/where-to` redirects there.
