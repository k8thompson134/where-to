/**
 * Prompt evaluation harness: scores each filter prompt style against labeled cases using real Claude calls.
 * Uses the same prompt builder and Claude call as /api/filter, so results reflect production.
 *
 *   npm run eval              # all styles
 *   npm run eval -- pattern   # one style
 *   npm run eval:dry          # list cases, no API calls
 */
import { config } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { FILTER_MODEL, filterPlacesWithClaude } from './src/lib/where-to/claudeFilter';
import { FILTER_PROMPT_STYLES, type FilterPromptStyle, type PlaceForFilter } from './src/lib/where-to/filter';

config({ path: ['.env.local', '.env'], quiet: true });

interface TestCase {
    name: string;
    query: string;
    places: PlaceForFilter[];
    expected: number[];
}

const testCases: TestCase[] = [
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

function calculateMetrics(actual: number[], expected: number[]) {
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

async function evaluatePromptStyle(client: Anthropic, style: FilterPromptStyle, cases: TestCase[]) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`EVALUATING: ${style.toUpperCase()}`);
    console.log('='.repeat(60));

    const results: { metrics: ReturnType<typeof calculateMetrics>; passed: boolean }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const testCase of cases) {
        process.stdout.write(`  ${testCase.name}... `);

        let indices: number[] = [];
        try {
            const res = await filterPlacesWithClaude(client, testCase.query, testCase.places, style);
            indices = res.indices;
            totalInputTokens += res.inputTokens;
            totalOutputTokens += res.outputTokens;
        } catch (error) {
            console.log(`ERROR ${error instanceof Error ? error.message : error}`);
        }
        const metrics = calculateMetrics(indices, testCase.expected);

        const passed = metrics.f1 === 1.0;
        console.log(`${passed ? '✓' : '✗'} F1=${metrics.f1.toFixed(2)} (P=${metrics.precision.toFixed(2)}, R=${metrics.recall.toFixed(2)})`);

        if (!passed) {
            console.log(`      Expected: [${testCase.expected.join(', ')}]`);
            console.log(`      Got:      [${indices.join(', ')}]`);
            if (metrics.falsePositives.length > 0) {
                console.log(`      False+:   ${metrics.falsePositives.map(i => testCase.places[i]?.name ?? `?${i}`).join(', ')}`);
            }
            if (metrics.falseNegatives.length > 0) {
                console.log(`      Missed:   ${metrics.falseNegatives.map(i => testCase.places[i]?.name ?? `?${i}`).join(', ')}`);
            }
        }

        results.push({ metrics, passed });
    }

    const passedCount = results.filter(r => r.passed).length;
    const avg = (f: (m: ReturnType<typeof calculateMetrics>) => number) =>
        results.reduce((sum, r) => sum + f(r.metrics), 0) / results.length;
    const avgF1 = avg(m => m.f1);

    console.log(`\n  SUMMARY for ${style}:`);
    console.log(`    Passed: ${passedCount}/${cases.length} (${(100 * passedCount / cases.length).toFixed(0)}%)`);
    console.log(`    Avg F1: ${avgF1.toFixed(3)}  Precision: ${avg(m => m.precision).toFixed(3)}  Recall: ${avg(m => m.recall).toFixed(3)}`);
    console.log(`    Tokens: ${totalInputTokens} in, ${totalOutputTokens} out`);

    return { style, passedCount, avgF1, totalInputTokens };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const specificStyle = args.find(a => !a.startsWith('--')) as FilterPromptStyle | undefined;

    console.log('Prompt Evaluation Harness');
    console.log(`Model: ${FILTER_MODEL}`);
    console.log(`Test cases: ${testCases.length}`);
    console.log(`Prompt styles: ${FILTER_PROMPT_STYLES.join(', ')}`);

    if (dryRun) {
        console.log('\n[DRY RUN] Showing test cases:\n');
        testCases.forEach((tc, i) => {
            console.log(`${i + 1}. ${tc.name}`);
            console.log(`   Query: "${tc.query}"`);
            console.log(`   Expected: [${tc.expected.join(', ')}]`);
            tc.places.forEach((p, j) => console.log(`   ${tc.expected.includes(j) ? '✓' : ' '} ${j}. ${p.name}`));
            console.log();
        });
        return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
        console.error('ERROR: set ANTHROPIC_API_KEY in .env.local');
        process.exit(1);
    }
    const client = new Anthropic({ apiKey });

    if (specificStyle && !FILTER_PROMPT_STYLES.includes(specificStyle)) {
        console.error(`Unknown style: ${specificStyle}`);
        process.exit(1);
    }
    const stylesToTest = specificStyle ? [specificStyle] : FILTER_PROMPT_STYLES;

    const allResults = [];
    for (const style of stylesToTest) {
        allResults.push(await evaluatePromptStyle(client, style, testCases));
    }

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
        console.log(`\nWINNER: ${allResults[0].style} (F1=${allResults[0].avgF1.toFixed(3)})`);
    }
}

main().catch(console.error);
