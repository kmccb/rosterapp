import { skyOf } from '../schedule/weather';

/**
 * The sky at kickoff, drawn rather than fetched.
 *
 * Inline so it costs no request and is there with no signal, and in
 * currentColor so it takes the team's accent like everything else. Kickoff is
 * at seven, so the clear-sky case is a moon far more often than a sun — using
 * one picture for both would look wrong every Friday in the season.
 */
export function SkyIcon({ code, day }: { code: number; day: boolean }) {
  const sky = skyOf(code);

  return (
    <svg
      className="sky-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {sky === 'clear' && (day ? <Sun /> : <Moon />)}
      {sky === 'partly' && (
        <>
          {day ? <Sun small /> : <Moon small />}
          <Cloud />
        </>
      )}
      {sky === 'cloudy' && <Cloud />}
      {sky === 'fog' && <Fog />}
      {sky === 'drizzle' && (
        <>
          <Cloud />
          <Drops n={2} />
        </>
      )}
      {sky === 'rain' && (
        <>
          <Cloud />
          <Drops n={3} />
        </>
      )}
      {sky === 'snow' && (
        <>
          <Cloud />
          <Flakes />
        </>
      )}
      {sky === 'thunder' && (
        <>
          <Cloud />
          <Bolt />
        </>
      )}
    </svg>
  );
}

const Sun = ({ small = false }: { small?: boolean }) =>
  small ? (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M8 1.5v1.4M8 11.1v1.4M1.5 7h1.4M13.1 7h1.4M3.4 2.4l1 1M11.6 2.4l-1 1" />
    </>
  ) : (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  );

const Moon = ({ small = false }: { small?: boolean }) =>
  small ? (
    <path d="M11 7.6A4.2 4.2 0 0 1 6.4 3a4.4 4.4 0 1 0 4.6 4.6z" />
  ) : (
    <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.8 8.8 0 1 0 10.2 10.2z" />
  );

const Cloud = () => <path d="M7.5 20h9.2a3.8 3.8 0 0 0 .3-7.6 5.6 5.6 0 0 0-10.7-1A3.9 3.9 0 0 0 7.5 20z" />;

const Fog = () => (
  <>
    <path d="M6.5 14h10.2a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.6-.9A3.5 3.5 0 0 0 6.5 14z" />
    <path d="M4 18h11M8 21.5h9" />
  </>
);

const Drops = ({ n }: { n: number }) => (
  <path
    d={
      n === 2
        ? 'M10 21.4l-.7 1.4M14.4 21.4l-.7 1.4'
        : 'M9 21.2l-.8 1.6M12.4 21.2l-.8 1.6M15.8 21.2l-.8 1.6'
    }
  />
);

/*
 * Six-pointed rather than the dots this started as: at 26px a column of dots
 * under a cloud is light rain, and telling a crowd it will drizzle when it will
 * snow is the one forecast mistake that costs somebody a cold night.
 */
const Flakes = () => (
  <g strokeWidth="1.2">
    <path d="M9.7 20.4v3.2M8.3 21.2l2.8 1.6M11.1 21.2l-2.8 1.6" />
    <path d="M14.9 20.4v3.2M13.5 21.2l2.8 1.6M16.3 21.2l-2.8 1.6" />
  </g>
);

const Bolt = () => <path d="M13 20.4l-2.6 3.4h3.2l-2 2.6" transform="translate(0 -2.4)" />;
