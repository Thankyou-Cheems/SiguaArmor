import { notFound } from "next/navigation";

import { factionDisplayName } from "../../../faction-display-name";
import { internationalPath } from "../../../site-paths";
import { WikiHeader } from "../../WikiHeader";
import { wikiFactions } from "../../wiki-data";

export default async function FactionDetailPage({
  params,
}: {
  params: Promise<{ shortName: string }>;
}) {
  const { shortName } = await params;
  const faction = wikiFactions.find(({ code }) => code === decodeURIComponent(shortName));
  if (!faction) notFound();
  const displayName = factionDisplayName(faction.code);

  return (
    <div className="sigua-wiki-replica">
      <WikiHeader />
      <main className="sigua-wiki-detail-main">
        <a className="sigua-wiki-back-link" href={internationalPath("/wiki/factions")}>← Factions</a>
        <section className="sigua-wiki-faction-detail">
          <div className="sigua-wiki-faction-detail__hero">
            <img src={faction.imagePath} alt={displayName} />
          </div>
          <div>
            <div className="sigua-wiki-detail-kicker">{faction.code}</div>
            <h1>{displayName}</h1>
            <p>{faction.setupCount} faction setups available in Squad.</p>
          </div>
        </section>
        <section className="sigua-wiki-detail-panel">
          <h2>Faction Setups</h2>
          <p>The live wiki exposes {faction.setupCount} setups for this faction.</p>
          <span className="sigua-wiki-detail-chip">{faction.setupCount} setups</span>
        </section>
      </main>
    </div>
  );
}
