import type { ArrayItemPerformer } from './types';

const performerFiles = Object.values(
  import.meta.glob('./performers/*.ts', { eager: true })
);
const performersArray = Object.values(performerFiles).map(key => {
  return Object.values(key!).flat();
}) as ArrayItemPerformer[];

export const PERFORMERS: ArrayItemPerformer[] = [...performersArray];
