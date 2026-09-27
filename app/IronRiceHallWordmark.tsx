export function IronRiceHallWordmark({ className = "" }: { className?: string }) {
  const classes = ["iron-rice-hall-wordmark", className].filter(Boolean).join(" ");
  return (
    <span className={classes} role="img" aria-label="战术小队铁皮饭堂">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size local wordmark should render its source asset directly */}
      <img
        src="/images/site/tactical-squad-wordmark.png"
        width={650}
        height={150}
        alt=""
        aria-hidden="true"
      />
      <strong aria-hidden="true">铁皮饭堂</strong>
    </span>
  );
}
