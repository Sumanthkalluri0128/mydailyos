import { buildSnapshot, snapshotIsStale, dayWho, whoLabel } from '../widgetSnapshot';

describe('widget snapshot', () => {
  it('calories left, water and character', () => {
    const s = buildSnapshot({ calorieTarget: 1800, eaten: 1200, burned: 200, waterMl: 750, waterTargetMl: 3000, who: 'goku' }, 1);
    expect(s.caloriesLeft).toBe(800);
    expect(s.caloriesText).toBe('800 kcal left');
    expect(s.waterText).toBe('750 / 3000 ml');
    expect(s.waterPct).toBe(25);
    expect(s.who).toBe('goku');
    expect(s.addWaterMl).toBe(250);
  });
  it('over budget, no goal, gentle mode', () => {
    expect(buildSnapshot({ calorieTarget: 1500, eaten: 1700 }).caloriesText).toBe('200 kcal over');
    expect(buildSnapshot({}).caloriesText).toBe('Set a calorie goal');
    expect(buildSnapshot({ calorieTarget: 1500, eaten: 1700, gentle: true }).caloriesText).toBe('Eating well today');
  });
  it('unknown water stays honest', () => {
    const s = buildSnapshot({ calorieTarget: 1800 });
    expect(s.waterMl).toBe(0);
    expect(s.waterPct).toBe(null);
  });
  it('yesterday is stale', () => {
    const s = buildSnapshot({}, new Date(2026, 9, 25, 23, 59).getTime());
    expect(snapshotIsStale(s, new Date(2026, 9, 26, 0, 1).getTime())).toBe(true);
    expect(snapshotIsStale(s, new Date(2026, 9, 25, 23, 59).getTime())).toBe(false);
  });
  it('display pieces the widget draws (value, unit, bars)', () => {
    const s = buildSnapshot({ calorieTarget: 2000, eaten: 500, waterMl: 750, waterTargetMl: 3000 }, 1);
    expect(s.caloriesValue).toBe('1,500'); expect(s.caloriesUnit).toBe('kcal left'); expect(s.caloriesPct).toBe(25); expect(s.over).toBe(false);
    expect(s.waterValue).toBe('750'); expect(s.waterGoal).toBe('of 3,000 ml'); expect(s.addWaterLabel).toBe('+250 ml');
  });
  it('over budget turns the unit to "over" and caps the bar', () => {
    const s = buildSnapshot({ calorieTarget: 1500, eaten: 1700 });
    expect(s.caloriesValue).toBe('200'); expect(s.caloriesUnit).toBe('kcal over'); expect(s.over).toBe(true); expect(s.caloriesPct).toBe(100);
  });
  it('gentle mode and hidden numbers never expose calorie numbers', () => {
    for (const flag of [{ gentle: true }, { hideNumbers: true }]) {
      const s = buildSnapshot({ calorieTarget: 1500, eaten: 1700, ...flag });
      expect(s.hidden).toBe(true); expect(s.caloriesValue).toBe('Eating well'); expect(s.caloriesPct).toBe(null); expect(s.caloriesText).toBe('Eating well today');
    }
  });
  it('kJ and fl oz units', () => {
    const s = buildSnapshot({ calorieTarget: 1000, eaten: 0, waterMl: 592, waterTargetMl: 2957, kj: true, oz: true });
    expect(s.caloriesValue).toBe('4,184'); expect(s.caloriesUnit).toBe('kJ left');
    expect(s.waterValue).toBe('20'); expect(s.waterGoal).toBe('of 100 fl oz'); expect(s.addWaterLabel).toBe('+8 fl oz');
  });
  it('no calorie goal: placeholder, no bar', () => {
    const s = buildSnapshot({ waterMl: 100 });
    expect(s.caloriesValue).toBe('—'); expect(s.caloriesPct).toBe(null); expect(s.waterGoal).toBe('ml');
  });
  it('shows the day\u2019s character (Sunday Naruto, Monday Zoro) unless one is given', () => {
    const sun = new Date(2026, 9, 25, 12).getTime(), mon = new Date(2026, 9, 26, 12).getTime();
    expect(dayWho(sun)).toBe('naruto'); expect(dayWho(mon)).toBe('zoro');
    expect(buildSnapshot({}, mon).whoLabel).toBe('Zoro');
    expect(buildSnapshot({ who: 'jinwoo' }, mon).whoLabel).toBe('Jin-Woo');
    expect(whoLabel('goku')).toBe('Goku');
  });
  it('protein, steps, streak, date and the four missions', () => {
    const s = buildSnapshot({ calorieTarget: 2000, eaten: 1500, waterMl: 3000, waterTargetMl: 3000, protein: 92, proteinTarget: 140, steps: 10500, stepsTarget: 10000, streak: 5 }, new Date(2026, 9, 28, 12).getTime());
    expect(s.dateLabel).toBe('WED, OCT 28');
    expect(s.proteinValue).toBe('92'); expect(s.proteinGoal).toBe('/ 140 g'); expect(s.proteinPct).toBe(66);
    expect(s.stepsValue).toBe('10,500'); expect(s.stepsGoal).toBe('/ 10k'); expect(s.stepsPct).toBe(100);
    expect(s.streakDays).toBe(5); expect(s.streakText).toBe('5 DAYS');
    expect(s.missions).toEqual({ protein: false, steps: true, calories: true, water: true });
  });
  it('unknown protein, steps and streak stay honest (dashes, no fake ticks)', () => {
    const s = buildSnapshot({ calorieTarget: 2000, eaten: 0 }, 1);
    expect(s.proteinValue).toBe('—'); expect(s.stepsValue).toBe('—'); expect(s.streakDays).toBe(null); expect(s.streakText).toBe('—');
    expect(s.missions.protein).toBe(null); expect(s.missions.steps).toBe(null); expect(s.missions.calories).toBe(false);
  });
  it('gentle mode hides the calorie mission; a zero streak says to start', () => {
    const s = buildSnapshot({ calorieTarget: 2000, eaten: 500, gentle: true, streak: 0 }, 1);
    expect(s.missions.calories).toBe(null); expect(s.streakText).toBe('Start today');
  });
});
