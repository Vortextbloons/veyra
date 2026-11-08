/** Matches the lightweight pre-React shell in index.html; styles live in public/startup.css. */
export function StartupScreen({ status = "Opening your workspace..." }: { status?: string }) {
  return (
    <div className="veyra-startup" role="status" aria-live="polite">
      <div className="veyra-startup__content">
        <img className="veyra-startup__logo" src="/veyra-logo.png" width={88} height={88} alt="" />
        <h1 className="veyra-startup__name">Veyra</h1>
        <p className="veyra-startup__tagline">Your local AI workspace</p>
        <div className="veyra-startup__track" aria-hidden="true"><span className="veyra-startup__indicator" /></div>
        <p className="veyra-startup__status">{status}</p>
        <p className="veyra-startup__footer">Chats &middot; Projects &middot; Ideas</p>
      </div>
    </div>
  );
}
