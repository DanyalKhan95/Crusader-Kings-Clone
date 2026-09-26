import { canContinue, resume, startChoosing } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';

export function MainMenu() {
  const game = useGame();
  const realms = game.state.countries.length - 1;
  return (
    <div className="menu-screen">
      <div className="menu-vignette" aria-hidden="true" />
      <main className="menu-card">
        <p className="caps menu-kicker">A grand strategy of nations</p>
        <h1 className="display menu-title">
          Crowns <span className="rubric">&amp;</span> Centuries
        </h1>
        <p className="caps menu-years">
          <span>1066</span>
          <span className="menu-years-rule" aria-hidden="true" />
          <span>2066</span>
        </p>
        <div className="menu-actions">
          {canContinue(game) && (
            <button className="btn primary big" onClick={() => resume(game)} autoFocus>
              <Icon name="play-button" /> Continue
            </button>
          )}
          <button
            className={`btn big ${canContinue(game) ? '' : 'primary'}`}
            onClick={() => startChoosing(game)}
            autoFocus={!canContinue(game)}
          >
            <Icon name="crown" /> New Campaign
          </button>
          <button className="btn" onClick={() => game.ui.set({ modal: 'credits' })}>
            <Icon name="open-book" /> Sources &amp; Credits
          </button>
        </div>
        <p className="menu-note">
          <strong>Early build.</strong> The whole world as it stood in September 1066: {realms} realms across three
          thousand provinces. Rule one of them: fill the treasury, raise armies, besiege castles and make war and peace.
          Diplomacy, faith and the ages to come arrive in later builds.
        </p>
      </main>
    </div>
  );
}
