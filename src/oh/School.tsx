/**
 * TASK 6 STUB: The school detail screen.
 *
 * This stub provides the minimal interface that Task 5 needs to compile.
 * Task 6 will replace this wholesale with the real implementation showing
 * the schedule and league standings for a chosen school.
 */

export function School({ slug, onChange }: { slug: string; onChange: () => void }) {
  return (
    <div className="screen">
      <p>School: {slug}</p>
      <button type="button" onClick={onChange}>
        Pick another school
      </button>
    </div>
  );
}
