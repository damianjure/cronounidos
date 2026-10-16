import { z } from "zod";
const choice = z.object({ id: z.uuid(), name: z.string() });
const status = z.enum(["pending", "confirmed", "unavailable"]);
export const staffing = z.object({
  meetingId: z.uuid(),
  title: z.string(),
  version: z.number().int(),
  closed: z.boolean(),
  teams: z.array(
    choice.extend({
      configure: z.boolean(),
      roles: z.array(choice),
      people: z.array(choice),
      positions: z.array(
        z.object({
          id: z.uuid(),
          role: z.string(),
          priority: z.enum(["critical", "required", "optional"]),
          index: z.number().int(),
          assignment: z
            .object({
              id: z.uuid(),
              personId: z.uuid(),
              personName: z.string(),
              status,
              respondedAt: z.string().nullable(),
            })
            .nullable(),
          history: z.array(
            z.object({ personName: z.string(), status, replaced: z.boolean() }),
          ),
        }),
      ),
    }),
  ),
});
export const configureRequest = z.object({
  meetingId: z.uuid(),
  version: z.coerce.number().int().positive(),
  teamId: z.uuid(),
  roleId: z.uuid(),
  priority: z.enum(["critical", "required", "optional"]),
  quantity: z.coerce.number().int().min(1).max(20),
});
export const staffRequest = z.object({
  meetingId: z.uuid(),
  version: z.coerce.number().int().positive(),
  positionId: z.uuid(),
  personId: z.uuid(),
  expected: z.uuid().nullable(),
  status: status.nullable(),
  respondedAt: z.iso.datetime({ offset: true }).nullable(),
  ack: z.literal("yes"),
});
export const conflicts = z.array(
  z.object({
    fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
    personName: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    description: z.string(),
    canExcept: z.boolean(),
    justification: z.string().nullable(),
  }),
);
export const exceptionRequest = z.object({
  meetingId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  reason: z.string().trim().min(10).max(2000),
});
export const blockStaffing = z.array(
  z.object({
    id: z.uuid(),
    personId: z.uuid(),
    personName: z.string(),
    teamId: z.uuid().nullable(),
    roleName: z.string(),
    status: z.enum(["pending", "confirmed", "unavailable"]),
  }),
);
