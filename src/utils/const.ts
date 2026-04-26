import type { ArrayItemPerformer } from './types';

const performerModules = import.meta.glob<Record<string, ArrayItemPerformer>>(
  ['./performers-1/*.ts'],
  { eager: true }
);

const performersArray: ArrayItemPerformer[] = Object.values(
  performerModules
).flatMap(mod => Object.values(mod));

export const PERFORMERS: ArrayItemPerformer[] = performersArray;
