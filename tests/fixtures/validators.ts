// Local re-export under an alias: must still be recognised as class-validator's IsString.
export { IsString as IsText } from 'class-validator';

// Project-specific decorator: must be ignored by every rule.
export function IsMoney(): PropertyDecorator {
  return () => undefined;
}
