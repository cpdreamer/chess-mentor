export default function EvalBar({ winPercent = 50, cp = 0, orientation = 'white' }) {
  const whiteShare = Math.max(2, Math.min(98, winPercent));
  const label =
    Math.abs(cp) >= 9000
      ? `M${10000 - Math.abs(cp)}`
      : ((cp >= 0 ? '+' : '') + (cp / 100).toFixed(1));
  const flipped = orientation === 'black';
  return (
    <div className="eval-bar" title={`Stockfish: ${label}`}>
      <div
        className="eval-bar-white"
        style={{
          height: `${whiteShare}%`,
          [flipped ? 'top' : 'bottom']: 0,
        }}
      />
      <span className={`eval-bar-label ${cp >= 0 ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  );
}
