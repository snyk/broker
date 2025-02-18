import { CorrelationHeaders } from '../broker-workload/correlation-headers';

export type RequestMetadata = {
  connectionIdentifier: string;
  payloadStreamingId: string;
  //   streamResponse: boolean;
} & CorrelationHeaders;
