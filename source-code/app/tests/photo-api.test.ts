import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  member: vi.fn(),
}));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: mocks.generate,
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ responses: (model: string) => model }),
}));
vi.mock('@/lib/supabase/server', () => ({
  adminDb: () => ({ rpc: mocks.rpc }),
  serverDb: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.member }) }) }),
  }),
}));
import { recogniseIngredients } from '@/server/photo-recognition';
import { POST } from '@/app/api/photos/route';

beforeEach(() => {
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'test-key-not-a-credential');
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } });
  mocks.member.mockResolvedValue({ data: { household_id: 'household' }, error: null });
  mocks.rpc.mockResolvedValue({ data: 'call-id', error: null });
  mocks.generate.mockResolvedValue({
    output: {
      items: [{ name: 'Onion', category: 'Vegetables', uncertain: false }],
      message: '',
      hasMore: false,
    },
    usage: { inputTokens: 100, outputTokens: 30 },
  });
});
describe('recognition adapter', () => {
  it('uses image input, bounded output, low reasoning, no tools and no stored request', async () => {
    const result = await recogniseIngredients(
      'actor',
      new Uint8Array([1]),
      new AbortController().signal,
    );
    expect(result.items[0].name).toBe('Onion');
    const input = mocks.generate.mock.calls[0][0];
    expect(input).toMatchObject({
      model: 'gpt-6-luna',
      maxRetries: 0,
      maxOutputTokens: 2500,
      providerOptions: { openai: { reasoningEffort: 'low', store: false } },
      include: { requestBody: false, responseBody: false },
    });
    expect(input).not.toHaveProperty('tools');
    expect(input.messages[0].content[1]).toMatchObject({ type: 'image', mediaType: 'image/jpeg' });
    expect(mocks.rpc).toHaveBeenCalledWith('record_ai_usage', {
      call_id: 'call-id',
      inputs: 100,
      outputs: 30,
    });
  });
  it('fails closed when the provider fails, without retry or inventory writes', async () => {
    mocks.generate.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      recogniseIngredients('actor', new Uint8Array([1]), new AbortController().signal),
    ).rejects.toMatchObject({ status: 502 });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['reserve_ai']);
  });
  it('respects the AI switch and persistent budget before calling the model', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    await expect(
      recogniseIngredients('actor', new Uint8Array([1]), new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.generate).not.toHaveBeenCalled();
    vi.stubEnv('AI_ENABLED', 'true');
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT429', message: 'Call limit reached.' },
    });
    await expect(
      recogniseIngredients('actor', new Uint8Array([1]), new AbortController().signal),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('validates model output rather than trusting suggestions', async () => {
    mocks.generate.mockResolvedValue({
      output: { items: [{ name: '' }], message: '', hasMore: false },
      usage: {},
    });
    await expect(
      recogniseIngredients('actor', new Uint8Array([1]), new AbortController().signal),
    ).rejects.toMatchObject({ status: 502 });
  });
});
describe('photo endpoint', () => {
  const request = (body: Uint8Array = new Uint8Array([1]), headers: Record<string, string> = {}) =>
    new Request('http://127.0.0.1:3000/api/photos', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3000', 'content-type': 'image/jpeg', ...headers },
      body: Buffer.from(body),
    });
  it('rejects a foreign origin or unsupported format', async () => {
    expect((await POST(request(undefined, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(request(undefined, { 'content-type': 'image/svg+xml' }))).status).toBe(415);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('requires authentication and household membership', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request())).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } });
    mocks.member.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('validates actual bytes and declared/streamed size before using credit', async () => {
    expect((await POST(request())).status).toBe(400);
    expect((await POST(request(undefined, { 'content-length': '3000000' }))).status).toBe(413);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('returns drafts without an inventory mutation', async () => {
    const photo = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();
    const response = await POST(request(photo));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).items).toHaveLength(1);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['reserve_ai', 'record_ai_usage']);
  });
});
