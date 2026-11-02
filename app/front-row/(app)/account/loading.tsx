import "./screen-fr-account.css";

/** Shown at once while Account loads: the headings as they are, every row a shimmer bar (shell.css .sk). */
export default function AccountLoading() {
  const rows = (n: number) => <div className="group">{Array.from({ length: n }, (_, i) => <div key={i} className="set"><span className="lines"><span className="sk" /></span></div>)}</div>;
  return (
    <section className="s-fr-account" aria-busy="true" aria-label="Loading your account">
      <p className="label">Settings</p>
      <h1>Account</h1>
      <div className="acols">
        <div className="sec"><h2>Profile</h2><div className="group"><div className="set prof"><span className="sk av" /><span className="lines"><span className="sk" /><span className="sk" /></span></div></div></div>
        <div className="sec"><h2>Appearance</h2>{rows(2)}</div>
        <div className="sec"><h2>Recording</h2>{rows(2)}</div>
        <div className="sec"><h2>Your data</h2>{rows(3)}</div>
        <div className="sec"><h2>Sign in</h2>{rows(2)}</div>
      </div>
    </section>
  );
}
