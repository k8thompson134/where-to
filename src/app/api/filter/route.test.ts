import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

const { POST } = await import('./route');

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/filter', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

const places = [
  { name: 'Starbucks', types: ['cafe'] },
  { name: 'Panera Bread', types: ['restaurant'] },
  { name: 'Colectivo Coffee', types: ['cafe'] },
];

describe('POST /api/filter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns empty indices without calling Claude when there are no places', async () => {
    const res = await post({ userQuery: 'coffee', places: [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ filteredIndices: [] });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns empty indices when places is missing', async () => {
    const res = await post({ userQuery: 'coffee' });
    expect(await res.json()).toEqual({ filteredIndices: [] });
  });

  it('sends the query and places to Claude with a JSON prefill and returns parsed indices', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '0, 2]' }] });

    const res = await post({ userQuery: 'coffee', places });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ filteredIndices: [0, 2] });

    const args = mockCreate.mock.calls[0][0];
    expect(args.messages[0].content).toContain('coffee');
    expect(args.messages[0].content).toContain('0. Starbucks');
    expect(args.messages[1]).toEqual({ role: 'assistant', content: '[' });
  });

  it('extracts indices when Claude adds text after the array', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '1, 2]\n\nThese are coffee shops.' }],
    });
    const res = await post({ userQuery: 'coffee', places });
    expect(await res.json()).toEqual({ filteredIndices: [1, 2] });
  });

  it('returns 500 with empty indices when Claude errors', async () => {
    mockCreate.mockImplementation(() => { return Promise.reject(Object.assign(new Error('overloaded'), {})); });
    const res = await post({ userQuery: 'coffee', places });
    expect(res.status).toBe(500);
    const body = await res.json(); console.log('BODY', JSON.stringify(body));
    expect(body).toEqual({ filteredIndices: [], error: 'overloaded' });
  });
});
