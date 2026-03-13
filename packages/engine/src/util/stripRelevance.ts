export const stripRelevance = <T extends { relevance: number }>(value: T): Omit<T, 'relevance'> => {
  const clone: Omit<T, 'relevance'> & { relevance?: number } = { ...value };
  delete clone.relevance;
  return clone;
};
