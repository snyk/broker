import { expandConfigObjectRecursively } from '../../../../../../lib/hybrid-sdk/common/config/config';

describe('common/config/config.ts', () => {
  describe('expandConfigObjectRecursively()', () => {
    it('expands placeholders in nested strings', () => {
      const result = expandConfigObjectRecursively(
        [{ url: 'https://$HOST/path', headers: { a: 'Bearer $TOKEN' } }],
        { HOST: 'example.com', TOKEN: 'secret' },
      );

      expect(result).toEqual([
        { url: 'https://example.com/path', headers: { a: 'Bearer secret' } },
      ]);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
    ])('returns %s input unchanged', (_label, input) => {
      expect(expandConfigObjectRecursively(input as any, {})).toBe(input);
    });

    it('leaves null values nested in the object unchanged', () => {
      expect(
        expandConfigObjectRecursively(
          { url: '$HOST', body: null },
          { HOST: 'h' },
        ),
      ).toEqual({ url: 'h', body: null });
    });
  });
});
