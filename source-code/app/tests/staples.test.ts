import { describe, expect, test } from 'vitest';
import { commonStaples, requestStaples } from '@/domain/staples';

describe('confirmed available staples', () => {
  test('only water, salt and cooking oil are common defaults', () => {
    expect(commonStaples).toEqual(['Water', 'Salt', 'Cooking oil']);
  });
  test('removing every default never silently adds it back', () => {
    expect(requestStaples([], '', [])).toEqual([]);
  });
  test('trims and deduplicates declared staples without inferring extra food', () => {
    expect(requestStaples(['Water', 'Salt'], ' salt , Pepper, , WATER ', [])).toEqual([
      'Water',
      'Salt',
      'Pepper',
    ]);
  });
  test('saved exclusions override selected and additional staples', () => {
    expect(requestStaples(['Water', 'Salt'], 'Butter, pepper', ['salt', 'dairy'])).toEqual([
      'Water',
      'pepper',
    ]);
  });
});
