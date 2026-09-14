/**
 * The Broker Client frames a streamed response as a 4-byte little-endian
 * length prefix, then the ioData (status and headers) JSON, then the body.
 *
 * When RES_BODY_URL_SUB is configured the substitution transform sits in the
 * same pipeline and reads every chunk as `Buffer.from(chunk).toString()`, so
 * the prefix takes a UTF-8 round trip along with the body. These tests pin how
 * that round trip behaves, because it decides whether the Broker Server can
 * read the frame at all.
 */
describe('ioData length prefix framing', () => {
  const prefixFor = (length: number): Buffer => {
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(length);
    return prefix;
  };

  const afterUtf8RoundTrip = (buf: Buffer): Buffer =>
    Buffer.from(Buffer.from(buf).toString(), 'utf8');

  it.each([515, 516, 519, 521, 538])(
    'survives a UTF-8 round trip when every prefix byte is below 0x80 (%i)',
    (length) => {
      const prefix = prefixFor(length);

      const roundTripped = afterUtf8RoundTrip(prefix);

      expect(roundTripped).toEqual(prefix);
      expect(roundTripped.readUInt32LE()).toEqual(length);
    },
  );

  it.each([128, 205, 255, 1000])(
    'is corrupted by a UTF-8 round trip once a prefix byte reaches 0x80 (%i)',
    (length) => {
      const prefix = prefixFor(length);

      const roundTripped = afterUtf8RoundTrip(prefix);

      // U+FFFD replaces the unmappable byte, so the prefix grows and the
      // Broker Server reads a metadata length that was never sent.
      expect(roundTripped).not.toEqual(prefix);
      expect(roundTripped.length).toBeGreaterThan(prefix.length);
      expect(roundTripped.readUInt32LE()).not.toEqual(length);
    },
  );

  it('corrupts roughly half of all possible ioData lengths', () => {
    const corrupted = Array.from(
      { length: 4096 },
      (_unused, length) => length,
    ).filter(
      (length) =>
        !afterUtf8RoundTrip(prefixFor(length)).equals(prefixFor(length)),
    ).length;

    expect(corrupted).toEqual(2048);
  });
});
