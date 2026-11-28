// Regression: flags were always "off" because the signed-in person was looked up in the wrong storage (AsyncStorage instead of SecureStore).
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../config/api', () => ({ get: jest.fn(), getStoredUser: jest.fn() }));

import { get, getStoredUser } from '../../config/api';
import { getFlags, refreshFlags } from '../flagStore';

const mGet = get as jest.Mock;
const mUser = getStoredUser as jest.Mock;

describe('flagStore', () => {
  beforeEach(() => { mGet.mockReset(); mUser.mockReset(); });

  it('loads the flags the server gives a signed-in person (user comes from getStoredUser)', async () => {
    mUser.mockResolvedValue({ email: 'A@x.dev' });
    mGet.mockResolvedValue({ flags: { 'smart-program': false, 'new-chart': true } });
    const f = await refreshFlags(true);
    expect(mGet).toHaveBeenCalledWith('/api/flags');
    expect(f['smart-program']).toBe(false);
    expect(getFlags()['new-chart']).toBe(true);
  });

  it('nobody signed in: no request, no flags', async () => {
    mUser.mockResolvedValue(null);
    expect(await refreshFlags(true)).toEqual({});
    expect(mGet).not.toHaveBeenCalled();
  });

  it('server unreachable: keeps the last answer instead of throwing', async () => {
    mUser.mockResolvedValue({ email: 'a@x.dev' });
    mGet.mockResolvedValueOnce({ flags: { x: true } });
    await refreshFlags(true);
    mGet.mockRejectedValueOnce(new Error('offline'));
    const f = await refreshFlags(true);
    expect(f.x).toBe(true);
  });
});
