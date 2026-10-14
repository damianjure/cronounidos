import Link from "next/link";
export type PublicRow = {
  meeting_id: string;
  activity: string;
  starts_at: string;
  duration_seconds: number;
  timezone: string;
  sort_order: number;
};
export function PublicAgenda({
  rows,
  individual = false,
}: {
  rows: PublicRow[];
  individual?: boolean;
}) {
  const ids = [...new Set(rows.map((r) => r.meeting_id))];
  return (
    <div className="public-agenda">
      {ids.map((id) => {
        const blocks = rows.filter((r) => r.meeting_id === id);
        const first = blocks[0];
        return (
          <section key={id}>
            <h3>
              {new Intl.DateTimeFormat("es-AR", {
                timeZone: first.timezone,
                dateStyle: "full",
              }).format(new Date(first.starts_at))}
            </h3>
            {blocks.map((r, i) => (
              <div className="agenda-row" key={`${id}-${i}`}>
                <time dateTime={r.starts_at}>
                  {new Intl.DateTimeFormat("es-AR", {
                    timeZone: r.timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(r.starts_at))}
                </time>
                <span>{r.activity}</span>
                <span className="muted">
                  {Math.round(r.duration_seconds / 60)} min
                </span>
              </div>
            ))}
            {!individual && (
              <Link className="button button-outline" href={`/reuniones/${id}`}>
                Ver agenda
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
