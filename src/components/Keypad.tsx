type Props = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  canDelete: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** A short buzz so you know the tap landed without looking. */
const tap = (): void => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
};

/**
 * A purpose-built numeric pad rather than an <input>: the OS keyboard would
 * cover the results and cost an extra tap to dismiss.
 */
export function Keypad({ onDigit, onBackspace, onClear, canDelete }: Props) {
  return (
    <div className="keypad" role="group" aria-label="Jersey number keypad">
      {DIGITS.map((d) => (
        <button
          key={d}
          type="button"
          className="key"
          onClick={() => {
            tap();
            onDigit(d);
          }}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        className="key key-secondary"
        onClick={() => {
          tap();
          onClear();
        }}
        disabled={!canDelete}
        aria-label="Clear"
      >
        clear
      </button>
      <button
        key="0"
        type="button"
        className="key"
        onClick={() => {
          tap();
          onDigit('0');
        }}
      >
        0
      </button>
      <button
        type="button"
        className="key key-secondary"
        onClick={() => {
          tap();
          onBackspace();
        }}
        disabled={!canDelete}
        aria-label="Delete last digit"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path
            d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="m12 10 5 4m0-4-5 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
