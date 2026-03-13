import { describe, it, expect, vi } from 'vitest';
import worker from '../index';

describe('Cloudflare Worker - cr-vector-pipeline', () => {
  it('handles OPTIONS requests for CORS', async () => {
    const request = new Request('http://localhost/git/info/refs', { method: 'OPTIONS' });
    const response = await worker.fetch(request, {} as any, {} as any);
    
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects unauthorized git-receive-pack requests', async () => {
    const request = new Request('http://localhost/git/session-123/git-receive-pack', {
      method: 'POST'
    });
    
    const response = await worker.fetch(request, {} as any, {} as any);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });

  it('saves git packfiles to the R2 bucket binding', async () => {
    // Mock the packfile payload
    const encoder = new TextEncoder();
    const mockPackfile = encoder.encode('PACK...mock...data...');
    
    const request = new Request('http://localhost/git/session-123/git-receive-pack', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test.token'
      },
      body: mockPackfile
    });

    // Mock the R2 Bucket environment binding
    const mockR2Bucket = {
      put: vi.fn().mockResolvedValue(true)
    };

    const env = {
      GIT_PACKS_BUCKET: mockR2Bucket
    } as any;

    const response = await worker.fetch(request, env, {} as any);
    
    // Verify response
    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).toContain('unpack ok');
    expect(bodyText).toContain('ok refs/heads/main');

    // Verify R2 Put was called correctly
    expect(mockR2Bucket.put).toHaveBeenCalledTimes(1);
    
    const putArgs = mockR2Bucket.put.mock.calls[0];
    const fileName = putArgs[0];
    const payload = putArgs[1];

    expect(fileName).toMatch(/^pack-session-123-\d+\.pack$/);
    expect(payload.byteLength).toBe(mockPackfile.byteLength);
  });
});
