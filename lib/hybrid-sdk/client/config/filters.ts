import { LoadedFiltersSet } from '../../common/types/options';

let globalFilterConfig: LoadedFiltersSet = {};

export const getFilterConfig = () => {
  return globalFilterConfig;
};

export const setFilterConfig = (filterConfig: LoadedFiltersSet) => {
  globalFilterConfig = filterConfig;
};
