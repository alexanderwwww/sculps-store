/**
 * The numbers behind the Online Store Web Vitals strip.
 *
 * Every value here is measured: the LCP/INP/CLS rows are what real browsers
 * reported to `/vitals`, and the device counts are distinct visitor sessions
 * from `events`. Nothing is modelled, estimated or filled in — a metric with
 * fewer than five samples comes back as null so the screen can say it is
 * still collecting instead of printing a zero that looks like a measurement.
 *
 * Lives under `app/admin/` because only the Online Store screen reads it.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { events, webVitals } from "~/db/schema";
import { p75 } from "~/lib/vitals";

export interface VitalCell {
  /** P75 over the window, or null when there are fewer than five samples. */
  p75: number | null;
  /** How many measurements the window holds — shown in the "Collecting" tip. */
  samples: number;
}

export interface DeviceCell {
  /** desktop | mobile | tablet, or "unknown" for rows recorded before the
      user-agent read existed. */
  device: string;
  sessions: number;
}

export interface VitalsStrip {
  days: number;
  lcp: VitalCell;
  inp: VitalCell;
  cls: VitalCell;
  devices: DeviceCell[];
}

/** The window Shopify reports on, and the one Google ranks on. */
export const VITALS_DAYS = 30;

export async function vitalsStrip(db: DB, storeId: string): Promise<VitalsStrip> {
  const since = new Date(Date.now() - VITALS_DAYS * 24 * 60 * 60 * 1000);

  const [rows, deviceRows] = await Promise.all([
    db
      .select({ metric: webVitals.metric, value: webVitals.value })
      .from(webVitals)
      .where(and(eq(webVitals.storeId, storeId), gte(webVitals.at, since))),

    db
      .select({
        device: events.device,
        sessions: sql<number>`cast(count(distinct ${events.sessionId}) as int)`,
      })
      .from(events)
      .where(and(eq(events.storeId, storeId), gte(events.at, since)))
      .groupBy(events.device)
      .orderBy(sql`2 desc`),
  ]);

  const cell = (metric: "LCP" | "INP" | "CLS"): VitalCell => {
    const values = rows.filter((row) => row.metric === metric).map((row) => row.value);
    return { p75: p75(values), samples: values.length };
  };

  return {
    days: VITALS_DAYS,
    lcp: cell("LCP"),
    inp: cell("INP"),
    cls: cell("CLS"),
    devices: deviceRows.map((row) => ({ device: row.device ?? "unknown", sessions: row.sessions })),
  };
}
