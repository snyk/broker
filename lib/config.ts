import * as camelCase from 'camelcase';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from 'snyk-config';

const snykConfig = loadConfig(__dirname + '/..');

dotenv.config({ path: process.cwd() + '/.env' });

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
    Object.entries(obj).map(([key, value]) => {
      return [key, typeof value === 'string' ? camelCase(value) : value];
    }),
  );
}

function expandValue(obj, value) {
  return value.replace(/([\\]?\$.+?\b)/g, (all, key) => {
    if (key[0] === '$') {
      key = key.slice(1);
      return obj[key] || '';
    }

    return key;
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
