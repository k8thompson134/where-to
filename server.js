const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Prompt strategies - set PROMPT_STYLE env var to switch styles
const PROMPT_STYLE = process.env.PROMPT_STYLE || 'pattern';

const prompts = {
    // ~70 tokens - pattern-based reasoning (best cost/quality balance)
    pattern: (query, placesList) => `${placesList}

"${query}" → JSON indices where query matches PRIMARY purpose.
Rule: Include if query IS what they do. Exclude if query is just something they ALSO offer.
Specific Brands: If query is a brand name (e.g., "World Market", "Dunkin"), ONLY match that specific chain.
Examples:
- "coffee" ✓ coffee shops, ✗ restaurants with coffee
- "grocery" ✓ supermarkets, ✗ convenience stores
- "bank" ✓ financial banks, ✗ places with "bank" in name`,

    // ~25 tokens - ultra minimal
    minimal: (query, placesList) => `${placesList}

"${query}" → JSON indices of matches:`,

    // ~45 tokens - primary purpose principle
    primary: (query, placesList) => `${placesList}

Query: "${query}"
Return JSON array of indices where query is the place's PRIMARY purpose (not secondary). Retail only.`,

    // ~150 tokens - original verbose
    verbose: (query, placesList) => `Filter these Google Places results. User wants: "${query}"

Places:
${placesList}

STRICT RULES - only include RETAIL STORES where you can BUY things:
- "coffee" = coffee shops ONLY (Starbucks, Colectivo, Stone Creek). EXCLUDE restaurants/cafes that just serve coffee.
- "craft store" = RETAIL arts & crafts supply stores ONLY (Michaels, Joann, Hobby Lobby, Blick Art Materials). EXCLUDE: university facilities, community centers, hardware stores, sex shops, variety stores, bead shops.
- "grocery" = grocery stores/supermarkets ONLY.

Return ONLY a JSON array of indices. No explanation, no text, just the array.
Example: [0, 3]`
};

// Filter places using Claude
app.post('/api/filter-places', async (req, res) => {
    try {
        const { userQuery, places } = req.body;

        if (!places || places.length === 0) {
            return res.json({ filteredIndices: [] });
        }

        const placesList = places.map((p, i) =>
            `${i}. ${p.name}${p.types ? ' - Types: ' + p.types.join(', ') : ''}`
        ).join('\n');

        let prompt = prompts[PROMPT_STYLE](userQuery, placesList);

        // Remove trailing bracket if present (migration path for patterns that still have it)
        if (prompt.trim().endsWith('[')) {
            prompt = prompt.trim().slice(0, -1).trim();
        }

        console.log(`[Claude] Style: ${PROMPT_STYLE} | Query: ${userQuery}`);

        const response = await anthropic.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 64,
            temperature: 0,
            messages: [
                { role: 'user', content: prompt },
                { role: 'assistant', content: '[' } // Pre-fill to force JSON
            ]
        });

        const responseText = response.content[0].text.trim();
        // Reconstruct full JSON
        const fullJsonStr = '[' + responseText;
        console.log('[Claude] Response:', fullJsonStr);

        const jsonMatch = fullJsonStr.match(/\[[\d,\s]*\]/);
        if (!jsonMatch) {
            console.log('[Claude] No JSON array found in response');
            return res.json({ filteredIndices: [] });
        }
        const indices = JSON.parse(jsonMatch[0]);

        console.log('[Claude] Filtered to indices:', indices);
        res.json({ filteredIndices: indices });

    } catch (error) {
        console.error('[Claude] Error:', error.message);
        // On error, return all indices (don't filter)
        const allIndices = req.body.places ? req.body.places.map((_, i) => i) : [];
        res.json({ filteredIndices: allIndices, error: error.message });
    }
});

// Extract JSON array from text (exported for testing)
function extractJsonArray(text) {
    const match = text.match(/\[[\d,\s]*\]/);
    return match ? JSON.parse(match[0]) : null;
}

const PORT = process.env.PORT || 3000;

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Endpoints:');
        console.log('  GET  /api/health - Health check');
        console.log('  POST /api/filter-places - Filter places with Claude');
    });
}

module.exports = { app, extractJsonArray };
