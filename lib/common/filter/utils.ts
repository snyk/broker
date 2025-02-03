import path from 'node:path';
import fs from 'fs';
import { makeSingleRawRequestToDownstream } from '../../hybrid-sdk/http/request';
import { PostFilterPreparedRequest } from '../relay/prepareRequest';
import version from '../utils/version';
import { findProjectRoot } from '../config/config';
import { log as logger } from '../../logs/logger';

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
