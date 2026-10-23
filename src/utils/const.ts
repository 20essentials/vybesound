import type { ArrayItemPerformer } from './types';

const performerModules = import.meta.glob<Record<string, unknown>>(
  ['./performers-1/*.ts', './performers-1/**/*.ts'],
  { eager: true }
);

const isPerformerTuple = (v: unknown): v is ArrayItemPerformer => {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'string' &&
    typeof v[1] === 'string' &&
    Array.isArray(v[2]) &&
    v[2].every(s => typeof s === 'string')
  );
};

const performersArray: ArrayItemPerformer[] = [];

for (const mod of Object.values(performerModules)) {
  for (const exported of Object.values(mod as Record<string, unknown>)) {
    if (Array.isArray(exported)) {
      // Could be a single performer tuple [name, baseUrl, songs[]]
      if (isPerformerTuple(exported)) {
        performersArray.push(exported);
        continue;
      }
      // Could be array of performer tuples
      for (const item of exported) {
        if (isPerformerTuple(item)) {
          performersArray.push(item);
        }
      }
    }
  }
}

export const PERFORMERS: ArrayItemPerformer[] = performersArray;
