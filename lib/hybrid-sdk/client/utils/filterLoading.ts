import filterRulesLoader from '../../common/filter/filter-rules-loading';
import { loadAllFilters } from '../../common/filter/filtersAsync';
import { log as logger } from '../../../logs/logger';
import { ClientOpts, CONFIGURATION } from '../../common/types/options';
import { getFilterConfig } from '../config/filters';

export const retrieveAndLoadFilters = async (
  clientOpts: ClientOpts,
): Promise<void> => {
  const globalFilterConfig = getFilterConfig();
  const filters = await filterRulesLoader(clientOpts.config as CONFIGURATION);
  clientOpts.filters = filters;
  globalFilterConfig.loadedFilters = loadAllFilters(filters, clientOpts.config);
  logger.debug('Loading Filters');
};
