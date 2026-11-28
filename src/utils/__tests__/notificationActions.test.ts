import { claim, confirmationText, DEFAULT_ACTION, normalizeResponse, responseKey, mealName } from '../notificationActionsPure';

const ids = { done: 'mark-done', snooze: 'snooze-10', water: 'log-water', water500: 'log-water-500', skipMeal: 'skip-meal', medTaken: 'med-taken' };
const resp = (action: string, data: any, over: any = {}) => ({
  actionIdentifier: action,
  notification: { date: 1_790_000_000, request: { identifier: 'n1', content: { title: '☀️ Lunch not logged', data }, ...over } },
});

describe('normalizeResponse', () => {
  it('reads the in-app listener shape', () => {
    const n = normalizeResponse(resp('skip-meal', { meal: 'lunch', screen: '/food?meal=lunch' }))!;
    expect(n).toMatchObject({ id: 'n1', action: 'skip-meal', title: '☀️ Lunch not logged' });
    expect(n.data.meal).toBe('lunch');
  });
  it('treats a response without an action as the default tap', () => {
    expect(normalizeResponse({ notification: { request: { identifier: 'x', content: { data: {} } } } })!.action).toBe(DEFAULT_ACTION);
  });
  it('accepts data that arrives as a JSON string (background payloads), and bad data as empty', () => {
    expect(normalizeResponse(resp('skip-meal', '{"meal":"dinner"}'))!.data.meal).toBe('dinner');
    expect(normalizeResponse(resp('skip-meal', '{oops'))!.data).toEqual({});
  });
  it('returns null for junk', () => {
    expect(normalizeResponse(null)).toBeNull();
    expect(normalizeResponse('x')).toBeNull();
  });
  it('turns seconds or milliseconds into milliseconds', () => {
    expect(normalizeResponse(resp('a', {}))!.deliveredAt).toBe(1_790_000_000_000);
    const ms = resp('a', {}); ms.notification.date = 1_790_000_000_123;
    expect(normalizeResponse(ms)!.deliveredAt).toBe(1_790_000_000_123);
  });
});

describe('one tap runs once', () => {
  it('the same tap seen twice is a duplicate; tomorrow\'s tap on a repeating reminder is not', () => {
    const a = normalizeResponse(resp('log-water', {}))!;
    const tomorrow = normalizeResponse({ ...resp('log-water', {}), notification: { date: 1_790_086_400, request: { identifier: 'n1', content: { data: {} } } } })!;
    let list: string[] = [];
    let r = claim(list, responseKey(a)); expect(r.already).toBe(false); list = r.list;
    r = claim(list, responseKey(a)); expect(r.already).toBe(true);
    r = claim(list, responseKey(tomorrow)); expect(r.already).toBe(false);
  });
  it('keeps only the most recent taps', () => {
    let list: string[] = [];
    for (let i = 0; i < 100; i += 1) list = claim(list, `k${i}`, 40).list;
    expect(list).toHaveLength(40);
    expect(list[list.length - 1]).toBe('k99');
  });
});

describe('confirmationText: every button says what it did', () => {
  it('skipping a meal names the meal', () => {
    const t = confirmationText(normalizeResponse(resp('skip-meal', { meal: 'lunch' }))!, ids)!;
    expect(t.title).toBe('Lunch skipped');
    expect(t.body).toMatch(/No more lunch reminders today/);
    expect(mealName('snacks')).toBe('Snacks');
  });
  it('task and water buttons confirm too', () => {
    expect(confirmationText(normalizeResponse(resp('mark-done', { taskId: 't' }))!, ids)!.title).toMatch(/done/i);
    expect(confirmationText(normalizeResponse(resp('snooze-10', { taskId: 't' }))!, ids)!.title).toMatch(/10 minutes/);
    expect(confirmationText(normalizeResponse(resp('log-water', {}))!, ids)!.title).toMatch(/250/);
    expect(confirmationText(normalizeResponse(resp('log-water-500', {}))!, ids)!.title).toMatch(/500/);
  });
  it('the medicine Taken button confirms', () => {
    expect(confirmationText(normalizeResponse(resp('med-taken', { medId: 'm1' }))!, ids)!.title).toMatch(/taken/i);
  });
  it('a skip without a meal, or a plain tap, says nothing', () => {
    expect(confirmationText(normalizeResponse(resp('skip-meal', {}))!, ids)).toBeNull();
    expect(confirmationText(normalizeResponse(resp(DEFAULT_ACTION, { screen: '/food' }))!, ids)).toBeNull();
  });
});

describe('buttons that open the app are not run in the background', () => {
  it('"Log it now" and a plain tap open a screen', async () => {
    const { opensScreen } = await import('../notificationActionsPure');
    expect(opensScreen('log-now')).toBe(true);
    expect(opensScreen(DEFAULT_ACTION)).toBe(true);
    expect(opensScreen('skip-meal')).toBe(false);
  });
  it('the skip confirmation names the meal in the sentence', () => {
    expect(confirmationText(normalizeResponse(resp('skip-meal', { meal: 'dinner' }))!, ids)!.body).toMatch(/No more dinner reminders today/);
  });
});
