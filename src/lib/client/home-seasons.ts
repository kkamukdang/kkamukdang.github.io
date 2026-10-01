/** Only Home's list panels change. No storage, navigation, search or learning writes. */
export function initHomeSeasons(doc: Document = document): void {
  const select = doc.querySelector<HTMLSelectElement>('[data-home-season-select]');
  const control = doc.querySelector<HTMLElement>('[data-home-season-control]');
  const label = doc.querySelector<HTMLElement>('[data-home-season-label]');
  const description = doc.querySelector<HTMLElement>('[data-home-season-description]');
  const announcement = doc.querySelector<HTMLElement>('[data-home-season-status]');
  const panels = [...doc.querySelectorAll<HTMLElement>('[data-home-season-panel]')];
  if (!select || !control || !label || panels.length < 2) return;

  function showSeason(season: string): boolean {
    const panel = panels.find((item) => item.dataset.homeSeasonPanel === season);
    if (!panel) return false;
    for (const item of panels) item.hidden = item !== panel;
    if (description) description.textContent = panel.dataset.description ?? '';
    if (announcement) announcement.textContent = `시즌 ${season} · ${panel.dataset.count}개 에피소드`;
    return true;
  }
  // A refresh starts at the server-rendered latest public season, even with form restoration.
  select.value = select.dataset.defaultSeason ?? select.value;
  if (!showSeason(select.value)) return;
  select.addEventListener('change', () => showSeason(select.value));
  label.hidden = true;
  control.hidden = false;
}
