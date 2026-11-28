// Static guards for the phone Home layout (no renderer needed): quick-help chips in one row, side quest + weekly review after the stat cards.
import fs from 'fs';
import path from 'path';
const home = fs.readFileSync(path.join(__dirname, '../../app/(tabs)/index.tsx'), 'utf8');

describe('mobile Home layout', () => {
  it('shows rough day, event and craving as one chip row', () => {
    expect(home).toMatch(/<RoughDay compact/);
    expect(home).toMatch(/<EventMode compact/);
    expect(home).toMatch(/<CravingTimer compact/);
  });
  it('puts side quest and the weekly summary after the stat cards', () => {
    const grid = home.indexOf('<View style={s.grid}>');
    expect(grid).toBeGreaterThan(0);
    expect(home.indexOf('<SideQuest')).toBeGreaterThan(grid);
    expect(home.indexOf("isVisible('weekly')")).toBeGreaterThan(home.indexOf('<SideQuest'));
    expect(home.match(/<SideQuest/g)).toHaveLength(1);
  });
  it('empty steps and exercise get a friendly line', () => {
    expect(home).toMatch(/Nothing yet\. A short walk counts/);
    expect(home).toMatch(/Nothing yet\. A 10 minute walk counts/);
  });
});

describe('Home Eaten card and portion editing', () => {
  const eaten = fs.readFileSync(path.join(__dirname, '../../components/home/EatenSheet.tsx'), 'utf8');
  it('opens a sheet with the portion editor and shows an Undo toast after a save', () => {
    expect(home).toMatch(/setPanel\('eaten'\)/);
    expect(eaten).toMatch(/PortionEdit/);
    expect(eaten).toMatch(/undoableDelete/);
  });
});
