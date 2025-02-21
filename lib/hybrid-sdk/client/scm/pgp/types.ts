export type PgpPrivateKey = {
  armoredKey: string;
  passphrase?: string;
};

export type CreateSignatureOptions = {
  messageRaw: string;
  privateKey: PgpPrivateKey;
};
