# Errand Planner - Startup Guide

## Prerequisites

- Node.js (v18+)
- Claude API key from [Anthropic Console](https://console.anthropic.com/)
- Google Maps API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

**Backend (Claude API):**
```bash
cp .env.example .env
```
Edit `.env` and add your Claude API key:
```
CLAUDE_API_KEY=sk-ant-api03-xxxxx
```

**Frontend (Google Maps):**
```bash
cp config.example.js config.js
```
Edit `config.js` and add your Google Maps API key:
```javascript
const CONFIG = {
    GOOGLE_MAPS_API_KEY: 'AIzaSy...',
    BACKEND_URL: 'http://localhost:3000'
};
```

### 3. Start the backend

```bash
npm start
```

You should see:
```
Server running on http://localhost:3000
Endpoints:
  GET  /api/health - Health check
  POST /api/filter-places - Filter places with Claude
```

### 4. Open the frontend

Open `display.html` in your browser, or serve it locally:
```bash
npx serve .
```

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start backend server |
| `npm test` | Run unit tests |
| `npm run eval` | Evaluate prompt styles against Claude |
| `npm run eval:dry` | Preview test cases without API calls |

## Configuration Options

Set these environment variables before starting:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `PROMPT_STYLE` | pattern | Prompt style: `pattern`, `minimal`, `primary`, `verbose` |

Example:
```bash
PORT=8080 PROMPT_STYLE=verbose npm start
```

## Troubleshooting

**"CLAUDE_API_KEY not set"**
- Make sure `.env` file exists and contains your key

**"Google Maps not loading"**
- Check `config.js` has valid Google Maps API key
- Ensure Maps JavaScript API and Places API are enabled in Google Cloud Console

**Empty filter results**
- Check backend logs for Claude responses
- Try `PROMPT_STYLE=verbose` for more explicit filtering
