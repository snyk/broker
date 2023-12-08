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
