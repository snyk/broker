export interface RequestPayload {
  url: string;
  headers?: any;
  method: string;
  body?: any;
  streamingID?: string;
}
