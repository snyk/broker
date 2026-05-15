// Module augmentation for express.Request. Adds the requestId property that
// the setRequestIdHeader middleware (lib/hybrid-sdk/common/http/middleware/requestId.ts)
// guarantees is set on every request handled by the local webserver.
//
// We declare it as a non-optional string because the middleware is mounted
// before any handler that reads it. If you add a code path that runs without
// the middleware (e.g. an alternate Express app), either mount the middleware
// there too or guard the read.

import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}
