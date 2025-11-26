export const capitalizeKeys = (recordSet: Record<string, unknown>) => {
  const capitalizedRecordSet: Record<string, unknown> = {};
  for (const key of Object.keys(recordSet)) {
    capitalizedRecordSet[key.toUpperCase()] = recordSet[key];
  }
  return capitalizedRecordSet;
};
