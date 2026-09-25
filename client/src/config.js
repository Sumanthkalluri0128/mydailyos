
const rawApiUrl =import.meta.env.API_URL || 'https://mydailyos.onrender.com';

export const API_URL = rawApiUrl.replace(/\/+$/, '');
