import { displayedSteps, getSteps, resetStepStore, setSteps } from '../stepStore';

describe('step source (Health Connect)', () => {
  beforeEach(() => resetStepStore('2026-10-07'));
  it('starts on the phone sensor', () => {
    expect(getSteps().source).toBe('sensor');
    expect(getSteps().hcSupported).toBe(false);
  });
  it('a Health Connect total is shown as-is (matches Samsung Health)', () => {
    setSteps({ source: 'health-connect', sourceNames: ['Samsung Health'], device: 23482, server: 8000 });
    expect(displayedSteps(getSteps())).toBe(23482);
  });
  it('a typed correction sits on top of the Health Connect total', () => {
    setSteps({ source: 'health-connect', device: 20000, manual: { value: 19000, deviceAt: 20000 } });
    setSteps({ device: 20300 });
    expect(displayedSteps(getSteps())).toBe(19300);
  });
  it('the chosen source survives the daily reset (it belongs to the phone, not the day)', () => {
    setSteps({ source: 'health-connect', sourceNames: ['Samsung Health'], hcSupported: true });
    resetStepStore('2026-10-08');
    expect(getSteps().source).toBe('health-connect');
    expect(getSteps().sourceNames).toEqual(['Samsung Health']);
    expect(getSteps().hcSupported).toBe(true);
    expect(getSteps().device).toBeNull();
  });
});
