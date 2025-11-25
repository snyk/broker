declare module 'undefsafe' {
  /**
   * Safely retrieves a value from an object using a dot-notation path.
   * Returns undefined if the path doesn't exist.
   * 
   * @param obj - The object to query
   * @param path - Dot-notation path (e.g., 'a.b.c' or 'a.b[0]')
   * @returns The value at the path, or undefined if not found
   */
  function undefsafe(obj: any, path: string): any;

  /**
   * Sets a value at a path in an object and returns the previous value.
   * If the path doesn't exist, returns undefined.
   * 
   * @param obj - The object to modify
   * @param path - Dot-notation path (e.g., 'a.b.c' or 'a.b[0]')
   * @param value - The value to set
   * @returns The previous value at the path, or undefined if path didn't exist
   */
  function undefsafe(obj: any, path: string, value: any): any;

  export default undefsafe;
}
