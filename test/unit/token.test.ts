import { maskToken } from '../../lib/token';

describe('token', () => {
  it('should return empty string if token is empty or null', async () => {
    const maskedTokenForEmpty = maskToken('');
    const maskedTokenForNull = maskToken('');

    expect(maskedTokenForEmpty).toEqual('');
    expect(maskedTokenForNull).toEqual('');
  });

  it('should return four first and last characters when masking', async () => {
    const maskedToken = maskToken('12345');
    const maskedUUIDToken = maskToken('aaaabbbb-0160-4126-a00d-ccccccccdddd');

    expect(maskedToken).toEqual('1234-...-2345');
    expect(maskedUUIDToken).toEqual('aaaa-...-dddd');
  });
});
