import { clearSchoolKept, currentSchool } from './recovery';

/**
 * The directory's way out of a page that threw. `school` says whether this page
 * shows a school at all: the panel, the privacy page and the demo keep no roster,
 * so there the only thing to offer is a reload.
 */
export function PageCrash({ school }: { school: boolean }) {
  const slug = school ? currentSchool() : null;

  return (
    <div role="alert" className="oh-crash">
      <h1 className="oh-crash-title">Something went wrong</h1>
      <p className="oh-crash-text">
        Try reloading first.
        {slug && ' If this keeps happening, clearing removes the copy of this school’s roster kept on this phone.'}
      </p>
      <button type="button" className="oh-crash-btn is-primary" onClick={() => location.reload()}>
        Reload
      </button>
      {slug && (
        <button
          type="button"
          className="oh-crash-btn"
          onClick={() => {
            clearSchoolKept(slug);
            location.reload();
          }}
        >
          Clear this roster
        </button>
      )}
    </div>
  );
}
