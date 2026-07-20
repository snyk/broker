# Broker Client-Side Logging Analysis

## Task: ACC-3428 - Review client side logs to ensure that customers don't need to enable debug logs to troubleshoot

## Current State

The Snyk Broker client uses [bunyan](https://github.com/trentm/node-bunyan) for logging with the following log levels:
- fatal
- error  
- warn
- info (default)
- debug
- trace

**Default log level:** `info` (configurable via `LOG_LEVEL` environment variable)

## Analysis Findings

### Critical Information Only Available at Debug Level

The following categories of information are currently logged at `debug` level but are essential for customer troubleshooting:

#### 1. Request Flow Tracking
**Location:** `lib/broker-workload/websocketRequests.ts:123-128`
```typescript
logger.debug(simplifiedContext, `[Websocket Flow] Received request from ${...}`)
```
**Issue:** Customers cannot track that their requests are being received without debug logs.
**Recommendation:** Promote to `info` level.

#### 2. Request Preparation
**Location:** `lib/broker-workload/prepareRequest.ts:128, 209`
```typescript
logger.debug(logContext, '[Relay] Preparing Downstream Request');
logger.debug(logContext, 'Prepared request');
```
**Issue:** Critical request transformation steps are invisible at default log level.
**Recommendation:** Promote to `info` level (consider condensing into a single log).

#### 3. Non-2xx HTTP Responses from Downstream
**Location:** `lib/hybrid-sdk/http/request.ts:75-83`
```typescript
logger.debug({ statusCode, url, requestDurationMs, requestId }, 'Non 2xx HTTP Code Received')
```
**Issue:** Failed downstream requests are not visible at info level.
**Note:** Non-404 errors are already logged at warn level in websocketRequests.ts:257, but the http/request.ts debug log provides additional context.
**Recommendation:** Promote to `info` level for visibility.

#### 4. Connection State Changes
**Location:** `lib/hybrid-sdk/client/connectionsManager/synchronizer.ts:167-173, 227`
```typescript
logger.debug({ id, name }, 'Connection (...) not in use by any orgs. Will check periodically...')
logger.debug({ connectionName }, 'Connection already configured.')
```
**Issue:** Connection lifecycle is invisible without debug logs.
**Recommendation:** Keep at debug level (these are noisy and informational).

#### 5. Filter Loading
**Location:** `lib/hybrid-sdk/client/utils/filterLoading.ts:14`
```typescript
logger.debug('Loading Filters');
```
**Issue:** Filter loading is a critical startup step but not visible.
**Recommendation:** Promote to `info` level.

#### 6. Service Commands
**Location:** `lib/hybrid-sdk/client/socketHandlers/serviceHandler.ts:16, 49`
```typescript
logger.debug({ command, requestId }, 'Service message received.')
logger.debug({}, 'Service command not available in classic broker.')
```
**Issue:** Service operations like filter reloads are invisible.
**Recommendation:** Promote service message receipt to `info`, keep unavailability message at debug.

#### 7. Connection Opening
**Location:** `lib/hybrid-sdk/client/socketHandlers/openHandler.ts:44`
```typescript
logger.debug({ ... }, 'Successfully established websocket connection ...')
```
**Issue:** Successful connection establishment is critical for troubleshooting but invisible.
**Recommendation:** Promote to `info` level.

### Areas with Insufficient Context

#### 1. Blocked Requests
**Location:** `lib/broker-workload/websocketRequests.ts:143`
```typescript
logger.warn(logContext, '[Websocket Flow][Blocked Request] Does not match any accept rule');
```
**Current:** Logs URL and basic context.
**Enhancement:** Already includes comprehensive context in logContext. This is good.

#### 2. Downstream Errors
**Location:** `lib/broker-workload/websocketRequests.ts:218-225`
```typescript
logger.error({ ...logContext, error, stackTrace }, '[Downstream] Caught error ...')
```
**Current:** Good context including error and stack trace.
**Enhancement:** Consider adding retry count if applicable.

#### 3. Connection Errors
**Location:** `lib/hybrid-sdk/client/socketHandlers/errorHandler.ts:3-8`
```typescript
logger.warn({ type, description }, 'Failed to connect to broker server.')
logger.warn({ type, description }, 'Error on websocket connection.')
```
**Current:** Basic error info.
**Enhancement:** Add connection identifier, retry attempt number, or other context to help diagnose.

## Recommendations Summary

### High Priority Changes (Promote debug → info)

1. **Request received** (websocketRequests.ts:123) - Essential for request tracking
2. **Request preparation** (prepareRequest.ts:128, 209) - Shows request transformation
3. **Filter loading** (filterLoading.ts:14) - Critical startup step
4. **Connection opened** (openHandler.ts:44) - Connection lifecycle visibility
5. **Service commands** (serviceHandler.ts:16) - Administrative operations

### Medium Priority Changes (Add context)

1. **Connection errors** (errorHandler.ts) - Add identifier and retry context
2. **Non-2xx responses** (request.ts:75) - Promote to info for better visibility

### Low Priority (Keep at debug)

1. **Polling messages** (synchronizer.ts) - Too noisy for info
2. **Connection already configured** (synchronizer.ts:227) - Normal operation, not actionable
3. **Auth renewal** (socket.ts:281) - Normal operation
4. **Plugin loading details** (pluginManager.ts) - Developer-focused

## Testing Recommendations

After implementing changes:

1. **Test with default (info) log level:**
   - Start broker client
   - Send test requests through broker
   - Verify request flow is visible
   - Trigger a filter reload service command
   - Verify connection lifecycle is visible

2. **Test error scenarios:**
   - Blocked requests (should still be warn)
   - Downstream service errors
   - Connection failures
   - Verify adequate context is provided

3. **Test that debug level still works:**
   - Enable debug logs
   - Verify additional detail is available
   - Ensure no regression in existing debug logs

## Implementation Notes

- Preserve existing log structure and context objects
- Maintain log message consistency
- Ensure sensitive data continues to be redacted via existing serializers
- Update tests if needed to match new log levels
