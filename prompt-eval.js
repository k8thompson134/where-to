/**
 * Prompt Evaluation Harness
 *
 * Tests different prompt styles against real Claude API responses.
 * Run with: node prompt-eval.js [style] [--dry-run]
 *
 * Examples:
 *   node prompt-eval.js              # Test all styles
 *   node prompt-eval.js primary      # Test only 'primary' style
 *   node prompt-eval.js --dry-run    # Show test cases without calling API
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
});

// ============================================================
// PROMPT STYLES (same as server.js)
// ============================================================

const prompts = {
    minimal: (query, placesList) => `${placesList}

"${query}" → JSON indices of matches:`,

    primary: (query, placesList) => `${placesList}

Query: "${query}"
Return JSON array of indices where query is the place's PRIMARY purpose (not secondary). Retail only.`,

    verbose: (query, placesList) => `Filter these Google Places results. User wants: "${query}"

Places:
${placesList}

STRICT RULES - only include RETAIL STORES where you can BUY things:
- "coffee" = coffee shops ONLY (Starbucks, Colectivo, Stone Creek). EXCLUDE restaurants/cafes that just serve coffee.
- "craft store" = RETAIL arts & crafts supply stores ONLY (Michaels, Joann, Hobby Lobby, Blick Art Materials). EXCLUDE: university facilities, community centers, hardware stores, sex shops, variety stores, bead shops.
- "grocery" = grocery stores/supermarkets ONLY.

Return ONLY a JSON array of indices. No explanation, no text, just the array.
Example: [0, 3]`,

    // NEW: Hybrid style with few-shot examples
    fewshot: (query, placesList) => `${placesList}

"${query}" → indices where PRIMARY purpose matches. Retail only.
✓ Starbucks for "coffee" (coffee shop)
✗ Panera for "coffee" (bakery-cafe)
JSON:`,

    // IMPROVED: Addresses specific failures from evaluation
    fewshot2: (query, placesList) => `${placesList}

"${query}" → JSON indices where this is the PRIMARY business purpose.
✓ Include: Starbucks, Dunkin, Dutch Bros, Caribou (coffee chains)
✓ Include: Costco, Sam's Club, Aldi (grocery/warehouse)
✗ Exclude: Wawa, 7-Eleven (convenience stores)
✗ Exclude: Panera, Denny's (restaurants)
Indices:`,

    // Pattern-based: teaches reasoning, not specific chains
    pattern: (query, placesList) => `${placesList}

"${query}" → JSON indices where query matches PRIMARY purpose.
Rule: Include if query IS what they do. Exclude if query is just something they ALSO offer.
Specific Brands: If query is a brand name (e.g., "World Market", "Dunkin"), ONLY match that specific chain.
Examples:
- "coffee" ✓ coffee shops, ✗ restaurants with coffee
- "grocery" ✓ supermarkets, ✗ convenience stores
- "bank" ✓ financial banks, ✗ places with "bank" in name`
};

// ============================================================
// TEST CASES: [query, places[], expectedIndices[]]
// ============================================================

const testCases = [
    // --- Coffee edge cases ---
    {
        name: 'coffee: shops vs restaurants',
        query: 'coffee',
        places: [
            { name: 'Starbucks', types: ['cafe', 'food'] },
            { name: "Denny's", types: ['restaurant', 'food'] },
            { name: 'IHOP', types: ['restaurant', 'food'] },
            { name: 'Dunkin Donuts', types: ['cafe', 'bakery'] },
            { name: "Peet's Coffee", types: ['cafe'] }
        ],
        expected: [0, 3, 4]  // Starbucks, Dunkin, Peet's
    },
    {
        name: 'coffee: exclude convenience stores',
        query: 'coffee shop',
        places: [
            { name: '7-Eleven', types: ['convenience_store', 'gas_station'] },
            { name: 'Kwik Trip', types: ['convenience_store', 'gas_station'] },
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Speedway', types: ['gas_station', 'convenience_store'] },
            { name: 'Caribou Coffee', types: ['cafe'] }
        ],
        expected: [2, 4]  // Starbucks, Caribou
    },
    {
        name: 'coffee: bakery hybrids',
        query: 'coffee',
        places: [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Panera Bread', types: ['bakery', 'cafe', 'restaurant'] },
            { name: 'Blue Bottle Coffee', types: ['cafe'] },
            { name: 'Corner Bakery Cafe', types: ['bakery', 'restaurant'] }
        ],
        expected: [0, 2]  // Starbucks, Blue Bottle (Panera is debatable)
    },

    // --- Craft store edge cases ---
    {
        name: 'craft: vs hardware stores',
        query: 'craft store',
        places: [
            { name: 'Michaels', types: ['store', 'home_goods_store'] },
            { name: 'Home Depot', types: ['hardware_store', 'store'] },
            { name: 'Joann Fabrics', types: ['store', 'home_goods_store'] },
            { name: 'Ace Hardware', types: ['hardware_store'] },
            { name: 'Hobby Lobby', types: ['store', 'home_goods_store'] }
        ],
        expected: [0, 2, 4]  // Michaels, Joann, Hobby Lobby
    },
    {
        name: 'craft: misleading names (craft beer)',
        query: 'craft store',
        places: [
            { name: 'The Craft House', types: ['bar', 'restaurant'] },
            { name: 'Blick Art Materials', types: ['store'] },
            { name: 'Craft Beer Cellar', types: ['liquor_store'] },
            { name: 'A.C. Moore Arts & Crafts', types: ['store'] }
        ],
        expected: [1, 3]  // Blick, A.C. Moore
    },

    // --- Grocery edge cases ---
    {
        name: 'grocery: vs convenience stores',
        query: 'grocery store',
        places: [
            { name: 'Kroger', types: ['grocery_or_supermarket', 'store'] },
            { name: '7-Eleven', types: ['convenience_store'] },
            { name: 'Whole Foods', types: ['grocery_or_supermarket', 'store'] },
            { name: 'Walgreens', types: ['pharmacy', 'convenience_store'] },
            { name: "Trader Joe's", types: ['grocery_or_supermarket'] }
        ],
        expected: [0, 2, 4]  // Kroger, Whole Foods, Trader Joe's
    },
    {
        name: 'grocery: warehouse clubs',
        query: 'grocery',
        places: [
            { name: 'Costco', types: ['store', 'grocery_or_supermarket'] },
            { name: 'Aldi', types: ['grocery_or_supermarket'] },
            { name: "Sam's Club", types: ['store'] },
            { name: 'Walmart Supercenter', types: ['department_store', 'grocery_or_supermarket'] },
            { name: 'Target', types: ['department_store'] }
        ],
        expected: [0, 1, 2, 3]  // All except Target (debatable on some)
    },

    // --- Ambiguous queries ---
    {
        name: 'bank: financial vs other meanings',
        query: 'bank',
        places: [
            { name: 'Chase Bank', types: ['bank', 'finance'] },
            { name: 'River Bank Park', types: ['park'] },
            { name: 'Wells Fargo', types: ['bank', 'atm'] },
            { name: 'West Bank Cafe', types: ['restaurant'] },
            { name: 'Bank of America', types: ['bank', 'finance'] }
        ],
        expected: [0, 2, 4]  // Chase, Wells Fargo, BofA
    },

    // --- Missing/empty types ---
    {
        name: 'coffee: missing types (name only)',
        query: 'coffee',
        places: [
            { name: 'Starbucks', types: [] },
            { name: 'Random Place', types: [] },
            { name: 'Dunkin Donuts', types: [] }
        ],
        expected: [0, 2]  // Starbucks, Dunkin (by name recognition)
    },

    // --- Misspellings ---
    {
        name: 'misspelled: coffe',
        query: 'coffe',
        places: [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Panera', types: ['restaurant'] },
            { name: 'Dunkin', types: ['cafe'] }
        ],
        expected: [0, 2]  // Should still work
    },

    // --- Regional chains ---
    {
        name: 'coffee: regional chains',
        query: 'coffee',
        places: [
            { name: 'Dutch Bros', types: ['cafe'] },
            { name: 'Caribou Coffee', types: ['cafe'] },
            { name: 'Wawa', types: ['convenience_store', 'cafe'] },
            { name: 'Colectivo Coffee', types: ['cafe'] },
            { name: 'Philz Coffee', types: ['cafe'] }
        ],
        expected: [0, 1, 3, 4]  // All except Wawa (primarily convenience store)
    },

    // --- Specific Brand Checks ---
    {
        name: 'brand: World Market',
        query: 'World Market',
        places: [
            { name: 'Cost Plus World Market', types: ['furniture_store', 'grocery_or_supermarket'] },
            { name: 'Milwaukee Public Market', types: ['grocery_or_supermarket', 'food'] },
            { name: 'Farmers Market', types: ['grocery_or_supermarket'] },
            { name: 'World Market Center', types: ['furniture_store'] }
        ],
        expected: [0] // Should only match the specific store, not generic markets
    }
];

// ============================================================
// METRICS CALCULATION
// ============================================================

function calculateMetrics(actual, expected) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);

    let truePositives = 0;
    for (const idx of actual) {
        if (expectedSet.has(idx)) truePositives++;
    }

    const precision = actual.length > 0 ? truePositives / actual.length : 0;
    const recall = expected.length > 0 ? truePositives / expected.length : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // False positives and negatives for debugging
    const falsePositives = actual.filter(i => !expectedSet.has(i));
    const falseNegatives = expected.filter(i => !actualSet.has(i));

    return { precision, recall, f1, truePositives, falsePositives, falseNegatives };
}

// ============================================================
// RUN EVALUATION
// ============================================================

async function runTest(testCase, promptStyle) {
    const placesList = testCase.places.map((p, i) =>
        `${i}. ${p.name}${p.types && p.types.length > 0 ? ' - Types: ' + p.types.join(', ') : ''}`
    ).join('\n');

    let prompt = prompts[promptStyle](testCase.query, placesList);

    // Remove trailing bracket if present, as it will be in the pre-fill
    if (prompt.trim().endsWith('[')) {
        prompt = prompt.trim().slice(0, -1).trim();
    }

    try {
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
        // Since we pre-filled '[', the model output will start after it. 
        // We need to reconstruct the full JSON.
        const fullJsonStr = '[' + responseText;

        const jsonMatch = fullJsonStr.match(/\[[\d,\s]*\]/);
        const indices = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        return {
            success: true,
            indices,
            rawResponse: fullJsonStr,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens
        };
    } catch (error) {
        return { success: false, error: error.message, indices: [] };
    }
}

async function evaluatePromptStyle(style, cases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`EVALUATING: ${style.toUpperCase()}`);
    console.log('='.repeat(60));

    const results = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const testCase of cases) {
        process.stdout.write(`  ${testCase.name}... `);

        const result = await runTest(testCase, style);
        const metrics = calculateMetrics(result.indices, testCase.expected);

        totalInputTokens += result.inputTokens || 0;
        totalOutputTokens += result.outputTokens || 0;

        const passed = metrics.f1 === 1.0;
        const status = passed ? '✓' : '✗';
        console.log(`${status} F1=${metrics.f1.toFixed(2)} (P=${metrics.precision.toFixed(2)}, R=${metrics.recall.toFixed(2)})`);

        if (!passed) {
            console.log(`      Expected: [${testCase.expected.join(', ')}]`);
            console.log(`      Got:      [${result.indices.join(', ')}]`);
            if (metrics.falsePositives.length > 0) {
                const fpNames = metrics.falsePositives.map(i => testCase.places[i]?.name || `?${i}`);
                console.log(`      False+:   ${fpNames.join(', ')}`);
            }
            if (metrics.falseNegatives.length > 0) {
                const fnNames = metrics.falseNegatives.map(i => testCase.places[i]?.name || `?${i}`);
                console.log(`      Missed:   ${fnNames.join(', ')}`);
            }
        }

        results.push({ testCase, result, metrics, passed });

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    // Summary
    const passedCount = results.filter(r => r.passed).length;
    const avgF1 = results.reduce((sum, r) => sum + r.metrics.f1, 0) / results.length;
    const avgPrecision = results.reduce((sum, r) => sum + r.metrics.precision, 0) / results.length;
    const avgRecall = results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length;

    console.log(`\n  SUMMARY for ${style}:`);
    console.log(`    Passed: ${passedCount}/${cases.length} (${(100 * passedCount / cases.length).toFixed(0)}%)`);
    console.log(`    Avg F1: ${avgF1.toFixed(3)}  Precision: ${avgPrecision.toFixed(3)}  Recall: ${avgRecall.toFixed(3)}`);
    console.log(`    Tokens: ${totalInputTokens} in, ${totalOutputTokens} out`);

    return { style, results, passedCount, avgF1, avgPrecision, avgRecall, totalInputTokens, totalOutputTokens };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const specificStyle = args.find(a => !a.startsWith('--'));

    console.log('Prompt Evaluation Harness');
    console.log(`Test cases: ${testCases.length}`);
    console.log(`Prompt styles: ${Object.keys(prompts).join(', ')}`);

    if (dryRun) {
        console.log('\n[DRY RUN] Showing test cases:\n');
        testCases.forEach((tc, i) => {
            console.log(`${i + 1}. ${tc.name}`);
            console.log(`   Query: "${tc.query}"`);
            console.log(`   Expected: [${tc.expected.join(', ')}]`);
            tc.places.forEach((p, j) => {
                const marker = tc.expected.includes(j) ? '✓' : ' ';
                console.log(`   ${marker} ${j}. ${p.name}`);
            });
            console.log();
        });
        return;
    }

    if (!process.env.CLAUDE_API_KEY) {
        console.error('ERROR: CLAUDE_API_KEY not set in .env');
        process.exit(1);
    }

    const stylesToTest = specificStyle ? [specificStyle] : Object.keys(prompts);
    const allResults = [];

    for (const style of stylesToTest) {
        if (!prompts[style]) {
            console.error(`Unknown style: ${style}`);
            continue;
        }
        const styleResult = await evaluatePromptStyle(style, testCases);
        allResults.push(styleResult);
    }

    // Final comparison
    if (allResults.length > 1) {
        console.log('\n' + '='.repeat(60));
        console.log('COMPARISON');
        console.log('='.repeat(60));
        console.log('\nStyle         Passed   Avg F1   Tokens (in)');
        console.log('-'.repeat(45));
        allResults.sort((a, b) => b.avgF1 - a.avgF1);
        for (const r of allResults) {
            console.log(`${r.style.padEnd(13)} ${String(r.passedCount).padStart(2)}/${testCases.length}     ${r.avgF1.toFixed(3)}    ${r.totalInputTokens}`);
        }
        console.log();
        console.log(`WINNER: ${allResults[0].style} (F1=${allResults[0].avgF1.toFixed(3)})`);
    }
}

main().catch(console.error);
