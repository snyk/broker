export const splitStringIntoLines = (
  inputString,
  lineLength,
  linePrefix = '',
) => {
  const regex = new RegExp(`.{1,${lineLength}}`, 'g');
  const lines = inputString.match(regex);
  return lines.join(`\n${linePrefix}`);
};

export const isUuid = (testValue) => {
  const regex = new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
  );
  return testValue.match(regex);
};
