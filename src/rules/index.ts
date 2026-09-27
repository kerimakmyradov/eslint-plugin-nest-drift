import { apiPropertyMatchesType } from './api-property-matches-type';
import { eachMatchesArray } from './each-matches-array';
import { enumMatchesType } from './enum-matches-type';
import { nestedTypeMatches } from './nested-type-matches';
import { nullableMatchesType } from './nullable-matches-type';
import { validatorMatchesType } from './validator-matches-type';

export const rules = {
  'validator-matches-type': validatorMatchesType,
  'enum-matches-type': enumMatchesType,
  'nested-type-matches': nestedTypeMatches,
  'each-matches-array': eachMatchesArray,
  'api-property-matches-type': apiPropertyMatchesType,
  'nullable-matches-type': nullableMatchesType,
};
