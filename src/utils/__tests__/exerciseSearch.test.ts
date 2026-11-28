import { searchExercises } from '../exerciseSearch';

const L = [
  ['sq', 'Barbell Back Squat', 'legs', 'barbell'], ['bp', 'Bench Press', 'chest', 'barbell'], ['pu', 'Push-up', 'chest', ''], ['pl', 'Plank', 'core', ''],
  ['cr', 'Cable Crunch', 'core', 'cable'], ['lu', 'Walking Lunges', 'legs', ''], ['bc', 'Dumbbell Biceps Curl', 'arms', 'dumbbell'], ['ibp', 'Incline Dumbbell Press', 'chest', 'dumbbell'],
].map(([id, name, cat, gear]) => ({ id, name, cat, gear }));
const ids = (q: string) => searchExercises(L, q).hits.map((e: any) => e.id);

describe('exerciseSearch (shared with the web app)', () => {
  test('typos, plurals, joined / split words, short forms and everyday words', () => {
    expect(ids('sqaut')).toContain('sq');
    expect(ids('squats')).toContain('sq');
    expect(ids('benchpress')).toContain('bp');
    expect(ids('pushup')).toContain('pu');
    expect(ids('push up')).toContain('pu');
    expect(ids('db press')).toContain('ibp');
    expect(ids('abs')).toEqual(expect.arrayContaining(['pl', 'cr']));
    expect(ids('press bench')).toContain('bp');
  });
  test('unrelated words find nothing; partial matches show as similar', () => {
    expect(ids('zzzz')).toEqual([]);
    const r = searchExercises(L, 'squat plank');
    expect(r.hits).toEqual([]);
    expect(r.similar.map((e: any) => e.id)).toEqual(expect.arrayContaining(['sq', 'pl']));
  });
});
