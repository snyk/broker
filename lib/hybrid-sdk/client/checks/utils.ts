export const splitStringIntoLines = (
  inputString: string,
  lineLength: number,
  linePrefix = '',
) => {
  const regex = new RegExp(`.{1,${lineLength}}`, 'g');
  const lines = inputString.match(regex) ?? [];
  return lines.join(`\n${linePrefix}`);
};
