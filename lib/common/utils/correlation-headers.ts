export interface CorrelationHeaders {
  requestId: string;
  actingOrgPublicId: string;
  actingGroupPublicId: string;
  productLine: string;
  flow: string;
}
export const getCorrelationDataFromHeaders = (
  headers: Headers,
): CorrelationHeaders => {
  const requestId = headers['snyk-request-id'];
  const actingOrgPublicId = headers['snyk-acting-org-public-id'];
  const actingGroupPublicId = headers['snyk-acting-group-public-id'];
  const productLine = headers['snyk-product-line'];
  const flow = headers['snyk-flow-name'];
  return {
    requestId,
    actingOrgPublicId,
    actingGroupPublicId,
    productLine,
    flow,
  };
};
