import { matchesExclusion, normalize } from './meals';

export const commonStaples = ['Water', 'Salt', 'Cooking oil'];

export function requestStaples(selected: string[], additional: string, exclusions: string[]) {
  const seen = new Set<string>();
  return [...selected, ...additional.split(',')]
    .map((name) => name.trim())
    .filter((name) => {
      const key = normalize(name);
      if (!key || seen.has(key) || matchesExclusion(name, exclusions)) return false;
      seen.add(key);
      return true;
    });
}
