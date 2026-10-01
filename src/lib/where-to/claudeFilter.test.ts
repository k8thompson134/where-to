import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { filterPlacesWithClaude, FILTER_MODEL } from './claudeFilter';

function clientReturning(text: string) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 50, output_tokens: 4 },
  });
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const places = [{ name: 'Starbucks' }, { name: "Denny's" }, { name: 'Colectivo' }];

describe('filterPlacesWithClaude', () => {
  it('sends the production prompt with a JSON prefill', async () => {
    const { client, create } = clientReturning('0, 2]');
    await filterPlacesWithClaude(client, 'coffee', places, 'pattern');
    const args = create.mock.calls[0][0];
    expect(args.model).toBe(FILTER_MODEL);
    expect(args.messages[0].content).toContain('0. Starbucks');
    expect(args.messages[1]).toEqual({ role: 'assistant', content: '[' });
    expect(args.stop_sequences).toEqual([']']);
  });

  it('dedupes and drops out-of-range indices', async () => {
    const { client } = clientReturning('2, 0, 2, 9]');
    const result = await filterPlacesWithClaude(client, 'coffee', places, 'pattern');
    expect(result.indices).toEqual([2, 0]);
    expect(result.inputTokens).toBe(50);
  });
});
