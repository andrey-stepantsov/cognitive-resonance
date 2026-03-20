import { http, HttpResponse } from 'msw';

export const handlers = [
  // Authentication Provider Mocks
  http.get('*/api/auth/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (authHeader === 'Bearer valid-token') {
      return HttpResponse.json({
        user: { id: 'cloud', name: 'Cloud User', email: 'cloud@edge' }
      });
    }
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),

  http.post('*/api/auth/login', async ({ request }) => {
    return HttpResponse.json({
      token: 'new-jwt-token',
      user: { id: 'cloud', name: 'Cloud User', email: 'cloud@edge' }
    });
  }),
  
  // Storage Provider Mocks
  http.put('*/api/sessions/:id', async () => {
    return HttpResponse.json({ ok: true });
  }),

  http.post('*/api/events', async () => {
    return HttpResponse.json({ ok: true });
  }),

  http.get('*/api/sessions', async () => {
    return HttpResponse.json([
      { id: 's1' },
      { id: 's2' }
    ]);
  }),

  http.get('*/api/events/s1', async () => {
    return HttpResponse.json([
      { id: 'e1', type: 'SESSION_CREATED', payload: '{"config":{"customName":null,"isArchived":false}}' }
    ]);
  }),

  http.get('*/api/events/s2', async () => {
    return HttpResponse.json([
      { id: 'e2', type: 'SESSION_CREATED', payload: '{"config":{"customName":"Named","isArchived":true}}' }
    ]);
  }),

  http.delete('*/api/sessions/:id', async () => {
    return HttpResponse.json({ ok: true });
  }),

  http.patch('*/api/sessions/:id', async () => {
    return HttpResponse.json({ ok: true });
  }),

  http.put('*/api/gems', async () => {
    return HttpResponse.json({ ok: true });
  }),

  http.get('*/api/gems', async () => {
    return HttpResponse.json({ systemPrompt: 'test' });
  }),
];
