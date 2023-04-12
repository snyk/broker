import * as openpgp from 'openpgp';

export const createCommitSignature = async (
  commit: {
    message: string;
    tree: string;
    parents: string[];
    author: { name: string; email: string; date: Date };
    committer: { name: string; email: string; date: Date };
    signature?: string;
  },
  privateKeyArmored: string,
  passphrase: string,
): Promise<string | undefined> => {
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: privateKeyArmored,
  });

  const decryptedPrivateKey = await openpgp.decryptKey({
    privateKey,
    passphrase,
  });

  const message = stringifyCommit(commit);

  const detachedSignature = await openpgp.sign({
    message: await openpgp.createMessage({ text: message }),
    signingKeys: [decryptedPrivateKey],
    detached: true,
  });

  return detachedSignature.toString().replace(/\r\n/g, '\n').trim();
};

export function stringifyCommit({
  message,
  tree,
  parents,
  author,
  committer = author,
}) {
  return `tree ${tree}
  parent ${parents[0]}
  author ${userToString(author)}
  committer ${userToString(committer)}
  ${message}`;
}

function userToString(user: { date: string; name: string; email: string }) {
  const date = new Date(user.date);
  const timestamp = Math.floor(date.getTime() / 1000);
  const timezone = normalizeOffset(date.getTimezoneOffset());

  return `${user.name} <${user.email}> ${timestamp} ${timezone}`;
}

function normalizeOffset(offset: number) {
  const prefix = offset <= 0 ? '+' : '-';
  const hours = Math.abs(offset / 60)
    .toString(10)
    .padStart(2, '0');
  const minutes = Math.abs(offset % 60)
    .toString(10)
    .padStart(2, '0');

  return `${prefix}${hours}${minutes}`;
}
