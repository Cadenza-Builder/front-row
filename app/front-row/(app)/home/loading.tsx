import "./screen-fr-home.css";

/** Shown at once while Home loads: its shape in shimmer bars (shell.css .sk), like the course page's loading.tsx. */
export default function HomeLoading() {
  return (
    <div className="s-fr-home" aria-busy="true" aria-label="Loading your courses">
      <div className="topbar">
        <svg className="pmark" viewBox="0 0 32 32" aria-hidden="true"><use href="#fr-logo" /></svg>
        <span className="sk avbtn" />
      </div>
      <div className="hello"><span className="sk hl" /><span className="sk hh" /></div>
      <section className="sec">
        <div className="head"><h2>Your courses</h2></div>
        <div className="grid">
          {[0, 1, 2].map((i) => <div key={i} className="course"><span className="sk tile" /><span className="lines"><span className="sk" /><span className="sk" /></span></div>)}
        </div>
      </section>
    </div>
  );
}
