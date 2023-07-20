interface SourceTypes {
  [key: string]: SourceType;
}

export interface Coordinates {
  path: string[];
  value: any;
}

interface SourceType {
  publicId: string;
  brokerType: string;
}
const findTypeByPublicId = (
  sourceTypes: SourceTypes,
  publicId: string,
): string | null => {
  const typesArray = Object.keys(sourceTypes);
  for (let i = 0; i < typesArray.length; i++) {
    if (sourceTypes[typesArray[i]].publicId == publicId) {
      return sourceTypes[typesArray[i]].brokerType;
    }
  }
  return null;
};

export const getRequestTypeFromTypeId = (
  config,
  typeId: string,
): string | null => {
  const result = findTypeByPublicId(config['SOURCE_TYPES'], typeId);
  return result || null;
};

export const concatAllPublicFiltersIntoArray = (allFilters: Object): Object => {
  const output: Object[] = [];
  const filtersKeys = Object.keys(allFilters);
  for (let i = 0; i < filtersKeys.length; i++) {
    if (allFilters[filtersKeys[i]].hasOwnProperty('public')) {
      output.push(...allFilters[filtersKeys[i]].public);
    }
  }

  return output;
};

export const findMemberCoordinates = (
  memberName: string,
  obj: any,
  path: string[] = [],
): Coordinates[] => {
  const coordinates: Coordinates[] = [];

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newPath = [...path, key];

      if (key === memberName) {
        coordinates.push({ path: newPath, value: obj[key] });
      }

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        coordinates.push(
          ...findMemberCoordinates(memberName, obj[key], newPath),
        );
      }
    }
  }

  return coordinates;
};
