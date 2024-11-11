import { getFilterConfig } from '../client/config/filters';
import { LOADEDFILTERSET } from '../common/types/filter';

export const filterRequest = (payload, options, websocketConnectionHandler) => {
  let filterResponse;
  if (
    options.config.brokerType == 'client' &&
    options.config.universalBrokerEnabled
  ) {
    const loadedFilters = getFilterConfig().loadedFilters as Map<
      string,
      LOADEDFILTERSET
    >;
    filterResponse =
      loadedFilters
        .get(websocketConnectionHandler.supportedIntegrationType)
        ?.private(payload) || false;
  } else if (options.config.brokerType == 'client') {
    const loadedFilters = getFilterConfig().loadedFilters as LOADEDFILTERSET;
    filterResponse = loadedFilters.private(payload);
  } else {
    const loadedFilters = options.loadedFilters as LOADEDFILTERSET;
    filterResponse = loadedFilters.private(payload);
  }
  return filterResponse;
};
