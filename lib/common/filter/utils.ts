import path from 'node:path';
import fs from 'fs';
import { makeSingleRawRequestToDownstream } from '../../hybrid-sdk/http/request';
import { PostFilterPreparedRequest } from '../relay/prepareRequest';
import version from '../utils/version';
import { findProjectRoot } from '../config/config';
import { log as logger } from '../../logs/logger';
import { Rule } from '../types/filter';

export const validateHeaders = (headerFilters, requestHeaders = []) => {
  for (const filter of headerFilters) {
    const headerValue = requestHeaders[filter.header];

    if (!headerValue) {
      return false;
    }

    if (!filter.values.includes(headerValue)) {
      return false;
    }
  }

  return true;
};

export const isValidURI = (uri: string) => {
  try {
    new URL(uri);
    return true;
  } catch (e) {
    return false;
  }
};

/* Retrieve filters from list of uris
   Can be uri or local path          */
export const retrieveFilters = async (locations: Map<string, string>) => {
  const retrievedFiltersMap = new Map<string, any>();
  for (const key of locations.keys()) {
    const location = locations.get(key);
    if (!location) {
      throw new Error(`Invalid filter uri for type ${key}`);
    }
    if (isValidURI(location)) {
      const req: PostFilterPreparedRequest = {
        url: location,
        headers: { 'user-agent': `Snyk Broker Client ${version}` },
        method: 'GET',
      };
      logger.debug({ location }, `Downloading ${key} filter`);
      const filter = await makeSingleRawRequestToDownstream(req);
      if (filter.statusCode && filter.statusCode > 299) {
        throw new Error(
          `Error downloading filter ${key}. Url ${location} returned ${filter.statusCode}`,
        );
      }
      retrievedFiltersMap.set(key, filter.body);
    } else {
      retrievedFiltersMap.set(
        key,
        fs.readFileSync(
          `${path.resolve(
            findProjectRoot(__dirname) ?? process.cwd(),
            location, // this should handle the override for custom filters
          )}`,
          'utf-8',
        ),
      );
    }
  }

  return retrievedFiltersMap;
};

export function deepMergeRules(arr1: Rule[], arr2: Rule[]): Rule[] {
  const isObject = (item: any): item is Record<string, any> =>
    item && typeof item === 'object' && !Array.isArray(item);

  const mergeArrays = (target: any[], source: any[]): any[] => {
    const result = [...target];

    for (const item of source) {
      if (isObject(item) && item.queryParam) {
        const existing = result.find(
          (i) => isObject(i) && i.queryParam === item.queryParam,
        );
        if (existing) {
          existing.values = [
            ...new Set([...(existing.values || []), ...(item.values || [])]),
          ];
        } else {
          result.push(item);
        }
      } else if (!result.includes(item)) {
        result.push(item);
      }
    }

    return result;
  };

  const mergeObjects = (
    target: Record<string, any>,
    source: Record<string, any>,
  ): Record<string, any> => {
    for (const key of Object.keys(source)) {
      if (isObject(target[key]) && isObject(source[key])) {
        target[key] = mergeObjects(target[key], source[key]);
      } else if (Array.isArray(target[key]) && Array.isArray(source[key])) {
        target[key] = mergeArrays(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  };

  const grouped: Record<string, Rule> = {};

  for (const rule of [...arr1, ...arr2]) {
    if (!rule || !isObject(rule)) continue;

    if ('method' in rule && 'path' in rule && 'origin' in rule) {
      const key = `${rule.method}:${rule.path}:${rule.origin}`;

      if (grouped[key]) {
        grouped[key] = mergeObjects(grouped[key], rule) as Rule;
      } else {
        grouped[key] = rule;
      }
    }
  }

  return Object.values(grouped);
}
