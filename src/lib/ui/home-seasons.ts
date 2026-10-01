type SeasonEpisode = { data: { season: number; no: number; draft?: boolean; unlisted?: boolean } };

/** Home uses whole public seasons; legacy static routes keep their own pagination. */
export function publicSeasonGroups<T extends SeasonEpisode>(episodes: readonly T[]): [number, T[]][] {
  const groups = new Map<number, T[]>();
  for (const ep of episodes) {
    if (ep.data.draft || ep.data.unlisted) continue;
    const list = groups.get(ep.data.season) ?? [];
    list.push(ep);
    groups.set(ep.data.season, list);
  }
  return [...groups].sort(([a], [b]) => b - a)
    .map(([season, list]) => [season, list.sort((a, b) => b.data.no - a.data.no)]);
}
