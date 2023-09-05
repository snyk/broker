import { FiltersType } from '../../common/filter/filters';

export interface ServerOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType;
}
