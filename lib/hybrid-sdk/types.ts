import { CorrelationHeaders } from '../common/utils/correlation-headers';

export type RequestMetadata = {
  connectionIdentifier: string;
  payloadStreamingId: string;
  //   streamResponse: boolean;
} & CorrelationHeaders;
