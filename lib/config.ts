import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from 'snyk-config';
import * as camelcase from 'camelcase';
import * as dotenv from 'dotenv';

const snykConfig = loadConfig(__dirname + '/..');

dotenv.config({
  silent: true,
  path: process.cwd() + '/.env',
});

expand(process.env);

const res = Object.assign(
  {},
  camelcaseObjectValues(snykConfig),
  camelcaseObjectValues(process.env),
);

if (res.caCert) {
  res.caCert = fs.readFileSync(
    path.resolve(process.cwd(), res.caCert as string),
  );
}

export const config = res;

function camelcaseObjectValues(obj: { [key: string]: unknown }) {
  return Object.fromEntries(
    Object.entries(obj)
      .map(([key, value]) => {
        return [
          [camelcase(key), value],
          [key, value],
        ];
      })
      .flat(),
  );
}

function expandValue(obj, value) {
  return value.replace(/([\\]?\$.+?\b)/g, (all, key) => {
    let newKey = key;

    if (key[0] === '$') {
      newKey = key.slice(1);
      return obj[newKey] || '';
    }

    return newKey;
  });
}

function expand(obj: { [key: string]: unknown }) {
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = expandValue(obj, obj[key]);
    if (value !== obj[key]) {
      obj[key] = value;
    }
  }

  return obj;
}
