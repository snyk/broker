import fs from 'fs';
import path from 'path';
import camelcase from 'camelcase';
import { loadConfig } from 'snyk-config';
import dotenv from 'dotenv';

dotenv.config({
  path: path.join(process.cwd(), '.env'),
});

const localConfig = loadConfig(path.join(__dirname, '..'));

function camelify(res: Record<string, any>): Record<string, any> {
  return Object.keys(res).reduce((acc, key) => {
    const camelKey = camelcase(key);
    acc[camelKey] = res[key];
    acc[key] = res[key];
    return acc;
  }, {} as Record<string, any>);
}

function expandValue(
  obj: Record<string, any>,
  value: string,
): string | string[] {
  let poolFound: string | undefined = undefined;
  let keyWithPool: string | undefined = undefined;
  const variableRegex = /(\\?\$.+?\b)/g;
  const variableMatcher = value.match(variableRegex);

  if (variableMatcher) {
    for (const key of variableMatcher) {
      if (key[0] === '$' && obj[key.slice(1) + '_POOL']) {
        keyWithPool = key.slice(1);
        poolFound = key.slice(1) + '_POOL';
        break;
      }
    }
  }

  if (poolFound) {
    const values: string[] = [];
    let pool: string[];

    if (Array.isArray(obj[poolFound])) {
      pool = obj[poolFound] as string[];
    } else {
      pool = (obj[poolFound] as string).split(',').map((s) => s.trim());
      obj[poolFound] = pool;
    }

    for (const o of pool) {
      values.push(
        value.replace(variableRegex, (all, key) => {
          if (key[0] === '$') {
            const keyToReplace = key.slice(1);
            return keyToReplace === keyWithPool ? o : obj[keyToReplace] || key;
          }
          return key;
        }),
      );
    }
    return values;
  } else {
    return value.replace(variableRegex, (all, key) => {
      if (key[0] === '$') {
        const keyToReplace = key.slice(1);
        return obj[keyToReplace] || key;
      }
      return key;
    });
  }
}

function expand(obj: Record<string, any>): Record<string, any> {
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = expandValue(obj, obj[key]);
    if (value && Array.isArray(value)) {
      obj[key + '_POOL'] = value;
    } else if (value !== obj[key]) {
      obj[key] = value;
    }
  }

  return obj;
}

expand(process.env);

export const config: Record<string, any> = Object.assign(
  {},
  camelify(localConfig),
  camelify(process.env),
);
if (config.caCert) {
  config.caCert = fs.readFileSync(
    path.resolve(process.cwd(), config.caCert as string),
  );
}

for (const [key, value] of Object.entries(config)) {
  if (
    (key.endsWith('Pool') || key.endsWith('_POOL')) &&
    !Array.isArray(value)
  ) {
    config[key] = value.split(',').map((s) => s.trim());
  }
}
