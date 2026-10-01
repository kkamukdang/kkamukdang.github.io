/** Display-only representatives: shared by Main and future Episode Hero. */
export interface EpisodeRepresentative { src: string; srcset: string; width: number; height: number; position: string; }
const representatives: Record<string, EpisodeRepresentative> = {
  '001-late-night-food': { src: '/ui/episode-001-700.webp', srcset: '/ui/episode-001-350.webp 350w, /ui/episode-001-700.webp 700w', width: 700, height: 264, position: 'center' },
  '002-chicken-order-mistake': { src: '/ui/episode-002-700.webp', srcset: '/ui/episode-002-350.webp 350w, /ui/episode-002-700.webp 700w', width: 700, height: 257, position: 'center' },
  '003-baseball-beer-run': { src: '/ui/episode-003-700.webp', srcset: '/ui/episode-003-350.webp 350w, /ui/episode-003-700.webp 700w', width: 700, height: 287, position: 'center' },
  '004-baseball-terms': { src: '/ui/episode-004-700.webp', srcset: '/ui/episode-004-350.webp 350w, /ui/episode-004-700.webp 700w', width: 700, height: 265, position: 'center' },
  '005-drama-netabare': { src: '/ui/episode-005-700.webp', srcset: '/ui/episode-005-350.webp 350w, /ui/episode-005-700.webp 700w', width: 700, height: 290, position: 'center' },
  '006-diet-again': { src: '/ui/episode-006-700.webp', srcset: '/ui/episode-006-350.webp 350w, /ui/episode-006-700.webp 700w', width: 700, height: 264, position: 'center' },
 };
export function episodeRepresentative(slug: string): EpisodeRepresentative | undefined { return representatives[slug]; }
