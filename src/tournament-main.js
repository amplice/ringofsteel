import { SelfPlayRunner } from './sim/SelfPlayRunner.js';

const statusEl = document.getElementById('status');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

window.runSelfPlayTournament = async (options = {}) => {
  console.log('[selfplay-page] tournament requested', options);
  const directSeries = options?.p1Profile && options?.p2Profile && options?.p1Char && options?.p2Char;
  setStatus(directSeries ? 'Running self-play series...' : 'Running self-play tournament...');
  const runner = new SelfPlayRunner();
  const result = directSeries
    ? await runner.runSeries(options)
    : await runner.runTournament(options);
  console.log('[selfplay-page] tournament completed', result?.summary);
  setStatus(directSeries ? 'Series complete.' : 'Tournament complete.');
  return result;
};

setStatus('Self-play harness ready.');
