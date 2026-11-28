import { scaleItems, scaleQuantity, totalFromPerServing, withBase } from '../recipeScale';

describe('recipe servings scaling', () => {
  it('scaling down and back up returns to the original amounts', () => {
    const items = withBase([{ foodName: 'Rice', quantity: 300 }, { foodName: 'Ghee', quantity: 2 }, { foodName: 'Salt', quantity: null }]);
    const half = scaleItems(items, 4, 2);
    expect(half.map((i) => i.quantity)).toEqual([150, 1, null]);
    expect(scaleItems(half, 4, 4).map((i) => i.quantity)).toEqual([300, 2, null]);
    expect(scaleItems(half, 4, 6).map((i) => i.quantity)).toEqual([450, 3, null]);
  });
  it('rounds sensibly and leaves bad input alone', () => {
    expect(scaleQuantity(1.5, 2, 3)).toBe(2.3);
    expect(scaleQuantity(333, 3, 2)).toBe(222);
    expect(scaleQuantity(5, 0, 2)).toBe(5);
  });
  it('per-serving macros are fixed, totals follow the servings', () => {
    expect(totalFromPerServing({ calories: 250, protein: 10.5 }, 4)).toEqual({ calories: 1000, protein: 42 });
  });
});
