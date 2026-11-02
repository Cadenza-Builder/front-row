import "./screen-fr-course.css";

/** Shown at once while the course loads (mockups/front-row/polish, "Course loading"): its shape, shimmering. */
export default function CourseLoading() {
  return (
    <div className="s-fr-course" aria-busy="true" aria-label="Loading the course">
      <div className="bar"><span className="sq" /><span className="sq" /></div>
      <div className="chead">
        <div className="ctitle"><span className="sk ic80" /><span className="lines"><span className="sk t" /><span className="sk m" /></span></div>
        <span className="sk recsk" />
      </div>
      <section className="sec">
        <h2>Lecture notes</h2>
        <div className="list">
          {[0, 1, 2, 3].map((i) => <div key={i} className="row"><span className="sk n" /><span className="lines"><span className="sk" /><span className="sk" /></span></div>)}
        </div>
      </section>
    </div>
  );
}
