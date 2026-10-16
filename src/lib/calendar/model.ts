import { z } from "zod";
export const calendarMeeting = z.object({
  id: z.uuid(), title: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  draft: z.boolean(), hasDraftChanges: z.boolean(), typeName: z.string().nullable(),
  typeColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  total: z.number().int().nonnegative(), confirmed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(), unavailable: z.number().int().nonnegative(), vacant: z.number().int().nonnegative(),
  criticalMissing: z.boolean(),
});
export const calendarSnapshot = z.object({meetings:z.array(calendarMeeting),upcoming:z.array(calendarMeeting).max(3)});
export type CalendarMeeting = z.infer<typeof calendarMeeting>;
export function summary(row: CalendarMeeting) {
  const percentage = row.total ? row.confirmed / row.total * 100 : null;
  const color: "gray"|"red"|"yellow"|"green" = percentage === null ? "gray" : percentage < 60 ? "red" : percentage < 90 || row.criticalMissing ? "yellow" : "green";
  const label = percentage === null ? "Sin puestos requeridos" : `${Math.floor(percentage)}% · ${row.confirmed}/${row.total} confirmados${row.criticalMissing ? " · Falta un rol crítico" : ""}`;
  return {percentage,color,label};
}
export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mes inválido");
  const [year,number]=month.split("-").map(Number);
  if(year<2000 || year>2100) throw new Error("Mes fuera de rango");
  const start=new Date(Date.UTC(year,number-1,1));
  const end=new Date(Date.UTC(year,number,1));
  const previous=new Date(Date.UTC(year,number-2,1)).toISOString().slice(0,7);
  const next=end.toISOString().slice(0,7);
  const days=Array.from({length:new Date(Date.UTC(year,number,0)).getUTCDate()},(_,index)=>`${month}-${String(index+1).padStart(2,"0")}`);
  return {from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10),previous,next,days,padding:(start.getUTCDay()+6)%7};
}
