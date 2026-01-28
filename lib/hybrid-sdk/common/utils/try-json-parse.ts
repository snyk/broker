// Object pool for parsed JSON results
const jsonObjectPool: Record<string, any>[] = [];

const getJsonObjectFromPool = (): Record<string, any> => {
  const obj = jsonObjectPool.pop();
  if (obj) {
    // Clear all properties
    Object.keys(obj).forEach((key) => delete obj[key]);
    return obj;
  }
  return {};
};

const returnJsonObjectToPool = (obj: Record<string, any>): void => {
  if (jsonObjectPool.length < 50) {
    // Limit pool size
    jsonObjectPool.push(obj);
  }
};

export default (data) => {
  if (!data) return {};

  try {
    // Avoid Buffer.from() allocation if data is already a string
    const jsonString =
      typeof data === 'string' ? data : Buffer.from(data).toString();
    const parsed = JSON.parse(jsonString);

    // Return the parsed object directly if it's an object, otherwise return empty object
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
};

// Export pool management functions for external use if needed
export { getJsonObjectFromPool, returnJsonObjectToPool };
