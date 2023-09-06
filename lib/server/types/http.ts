import { FiltersType } from '../../common/filter/legacyFilters';

export interface ServerOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType;
}
