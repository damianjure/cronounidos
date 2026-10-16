import { describe, it, expect } from "vitest";
import { confirmationRequest, expectedRows, groupByPerson, type ConfirmationRow } from "@/lib/confirmations/model";
const personId="10000000-0000-4000-8000-000000000101";
const meetingId="10000000-0000-4000-8000-000000000001";
const row:ConfirmationRow={id:crypto.randomUUID(),personId,personName:"Persona ficticia",teamName:"Equipo",roleName:null,activity:"Actividad",status:"pending",respondedAt:null,history:[]};
describe("contrato de confirmaciones",()=>{
  it("proyecta solo la precondición para responder sin enviar notas ni historial",()=>{
    expect(expectedRows([row])).toEqual([{id:row.id,status:"pending",respondedAt:null}]);
  });
  it("agrupa roles por identidad, no por nombre",()=>{
    const second={...row,id:crypto.randomUUID()};
    const other={...row,id:crypto.randomUUID(),personId:crypto.randomUUID()};
    const groups=groupByPerson([row,second,other]);
    expect(groups).toHaveLength(2);expect(groups[0].rows).toHaveLength(2);
  });
  it("acepta solo estados conocidos, UUIDs, timestamp explícito y hasta cien filas únicas",()=>{
    const request={meetingId,personId,status:"confirmed",expected:expectedRows([row])};
    expect(confirmationRequest.safeParse(request).success).toBe(true);
    for(const invalid of [{...request,status:"admin"},{...request,expected:[]},{...request,expected:[{id:row.id,status:"pending"}]},{...request,expected:[...request.expected,...request.expected]}, {...request,expected:[{...request.expected[0],respondedAt:"no-es-fecha"}]}])
      expect(confirmationRequest.safeParse(invalid).success).toBe(false);
  });
});
