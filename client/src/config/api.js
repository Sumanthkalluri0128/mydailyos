import { API_URL } from '../config';

export async function apiFetch(input, options = {}) {
  const token = localStorage.getItem('mydailyos_token');
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = typeof input === 'string' && input.startsWith('/')
    ? `${API_URL}${input}`
    : input;

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && token) {
    localStorage.removeItem('mydailyos_token');
    localStorage.removeItem('mydailyos_user');
    window.location.reload();
  }

  return response;
}
