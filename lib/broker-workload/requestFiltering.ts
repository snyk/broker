import { getFilterConfig } from '../hybrid-sdk/client/config/filters';
import { WebSocketConnection } from '../hybrid-sdk/client/types/client';
import { LOADEDFILTERSET } from '../hybrid-sdk/common/types/filter';

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

export const filterClientRequest = (
  payload,
  options,
  websocketConnectionHandler: WebSocketConnection,
) => {
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
        .get(websocketConnectionHandler.supportedIntegrationType) // The chosen type is determined by websocket connect middlwr
        ?.public(payload) || false;
  } else if (options.config.brokerType == 'client') {
    const loadedFilters = getFilterConfig().loadedFilters as LOADEDFILTERSET;
    filterResponse = loadedFilters.public(payload);
  } else {
    const loadedFilters = options.loadedFilters as LOADEDFILTERSET;
    filterResponse = loadedFilters.public(payload);
  }
  return filterResponse;
};
