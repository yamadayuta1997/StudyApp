import { moveItem } from '../imageReorder';

describe('moveItem', () => {
  test('moves item up', () => {
    expect(moveItem([1, 2, 3], 1, 'up')).toEqual([2, 1, 3]);
  });

  test('moves item down', () => {
    expect(moveItem([1, 2, 3], 1, 'down')).toEqual([1, 3, 2]);
  });

  test('no-op at top boundary', () => {
    const arr = [1, 2, 3];
    expect(moveItem(arr, 0, 'up')).toEqual([1, 2, 3]);
  });

  test('no-op at bottom boundary', () => {
    const arr = [1, 2, 3];
    expect(moveItem(arr, 2, 'down')).toEqual([1, 2, 3]);
  });

  test('single item list', () => {
    expect(moveItem([1], 0, 'up')).toEqual([1]);
    expect(moveItem([1], 0, 'down')).toEqual([1]);
  });

  test('does not mutate original array', () => {
    const arr = [1, 2, 3];
    const result = moveItem(arr, 0, 'down');
    expect(arr).toEqual([1, 2, 3]);
    expect(result).toEqual([2, 1, 3]);
  });

  test('swaps first and last in two-element array', () => {
    expect(moveItem(['a', 'b'], 0, 'down')).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 1, 'up')).toEqual(['b', 'a']);
  });

  test('works with object arrays', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = moveItem(items, 0, 'down');
    expect(result[0]).toEqual({ id: 2 });
    expect(result[1]).toEqual({ id: 1 });
    expect(result[2]).toEqual({ id: 3 });
  });
});
