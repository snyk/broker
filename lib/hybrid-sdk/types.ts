import { CorrelationHeaders } from '../broker-workload/correlation-headers';

export type RequestMetadata = {
  connectionIdentifier: string;
  payloadStreamingId: string;
  //   streamResponse: boolean;
} & CorrelationHeaders;
export interface PostFilterPreparedRequest {
  url: string;
  headers: Object;
  method: string;
  body?: any;
  timeoutMs?: number;
}
