import fs from 'fs';
import path from 'path';
import { PHOTO_NAMES, hasPhoto, photoFor } from '../exerciseImages';
import { EXERCISES } from '../workoutPlan';

describe('exercise photos (generated from the web app)', () => {
  it('finds a photo by name, ignoring case and punctuation', () => {
    expect(photoFor('Lat Pulldown')?.thumb).toBeTruthy();
    expect(photoFor('lat  pulldown')?.thumb).toBeTruthy();
    expect(photoFor('Triceps Pushdown')?.how).toBeTruthy();
  });
  it('gives no photo to a movement the sheets do not show (never a wrong one)', () => {
    expect(photoFor('Wall Push-up')).toBeNull();
    expect(hasPhoto('Lateral Raise')).toBe(false);
    expect(photoFor(undefined)).toBeNull();
  });
  it('every name listed in the map resolves to a photo', () => {
    for (const n of PHOTO_NAMES) expect(photoFor(n)?.thumb).toBeTruthy();
  });
  it('every image file the map uses is in assets/exercises, and none is left over', () => {
    const src = fs.readFileSync(path.join(__dirname, '../exerciseImages.ts'), 'utf8');
    const used = [...src.matchAll(/assets\/exercises\/([a-z0-9-]+)\.webp/g)].map((m) => m[1]);
    const dir = path.join(__dirname, '../../../assets/exercises');
    const have = fs.readdirSync(dir).map((f) => f.replace(/\.webp$/, ''));
    expect(used.filter((u) => !have.includes(u))).toEqual([]);
    expect(have.filter((h) => !used.includes(h))).toEqual([]);
  });
  it('plan exercises that share a name with a sheet photo get it', () => {
    const withPhoto = Object.values(EXERCISES).filter((e) => hasPhoto(e.name));
    expect(withPhoto.length).toBeGreaterThanOrEqual(20);
    expect(withPhoto.map((e) => e.name)).toEqual(expect.arrayContaining(['Plank', 'Lat Pulldown', 'Calf Raise']));
  });
});
