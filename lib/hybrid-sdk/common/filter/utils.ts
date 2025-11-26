import path from 'node:path';
import fs from 'fs';
import { findProjectRoot } from '../config/config';
import { log as logger } from '../../../logs/logger';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { makeSingleRawRequestToDownstream } from '../../http/request';
import { ValidEntryObject } from '../types/filter';

export const validateHeaders = (
  headerFilters: ValidEntryObject[],
  requestHeaders: Record<string, string> = {},
) => {
  for (const filter of headerFilters) {
    const headerValue = requestHeaders[filter.header!];

    if (!headerValue) {
      return false;
    }

    if (!filter.values!.includes(headerValue)) {
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
  const retrievedFiltersMap = new Map<string, string>();
  for (const key of locations.keys()) {
    const location = locations.get(key);
    if (!location) {
      throw new Error(`Invalid filter uri for type ${key}`);
    }
    if (isValidURI(location)) {
      const req: PostFilterPreparedRequest = {
        url: location,
        headers: {},
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
