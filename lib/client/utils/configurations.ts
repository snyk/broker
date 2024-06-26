export const capitalizeKeys = (recordSet: Record<string, any>) => {
  const capitalizedRecordSet = {};
  for (const key of Object.keys(recordSet)) {
    capitalizedRecordSet[key.toUpperCase()] = recordSet[key];
  }
  return capitalizedRecordSet;
};
