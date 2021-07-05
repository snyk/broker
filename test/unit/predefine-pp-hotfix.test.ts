describe('predefine prototype pollution', () => {
  it('is not exploitable', () => {
    require('../../lib/index');

    require('primus').prototype.merge(
      {},
      JSON.parse('{"__proto__": {"a": "b"}}'),
    );
    expect(({} as any).a).toBeUndefined();
  });
});
