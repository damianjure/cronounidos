import { it,expect } from "vitest";
import {monthRange,summary,type CalendarMeeting} from "@/lib/calendar/model";
const meeting:CalendarMeeting={id:crypto.randomUUID(),title:"Ficticia",date:"2028-02-29",draft:false,hasDraftChanges:false,typeName:null,typeColor:"#165c7d",total:0,confirmed:0,pending:0,unavailable:0,vacant:0,criticalMissing:false};
it("calendario usa mes real, lunes primero y febrero bisiesto",()=>{
  const range=monthRange("2028-02");expect(range.days).toHaveLength(29);expect(range.padding).toBe(1);
  expect(range.to).toBe("2028-03-01");expect(monthRange("2026-12").next).toBe("2027-01");
  expect(monthRange("2026-01").previous).toBe("2025-12");
  for(const invalid of ["2026-13","2026-1","no", "1999-01"])
    expect(()=>monthRange(invalid)).toThrow();
});
it("cobertura agregada distingue sin puestos, umbrales y crítico faltante",()=>{
  expect(summary(meeting).color).toBe("gray");
  expect(summary({...meeting,total:10,confirmed:5}).color).toBe("red");
  expect(summary({...meeting,total:10,confirmed:6}).color).toBe("yellow");
  expect(summary({...meeting,total:10,confirmed:9,criticalMissing:true}).color).toBe("yellow");
  expect(summary({...meeting,total:10,confirmed:9}).color).toBe("green");
  expect(summary({...meeting,total:1000,confirmed:899}).label).toContain("89%");
});
