import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canManageFlyerInScope,
  flyerProfileDenial,
  isEditablePrivateEvent,
} from "./access.ts";

Deno.test("flyer access rejects unprovisioned, inactive and temporary-password profiles", () => {
  assertEquals(flyerProfileDenial(null), "not_active");
  assertEquals(
    flyerProfileDenial({
      account_status: "inactive",
      must_change_password: false,
    }),
    "not_active",
  );
  assertEquals(
    flyerProfileDenial({
      account_status: "active",
      must_change_password: true,
    }),
    "password_change_required",
  );
  assertEquals(
    flyerProfileDenial({
      account_status: "active",
      must_change_password: false,
    }),
    null,
  );
});

Deno.test("flyer management requires an active branch and a matching capability scope", () => {
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["branch"],
      directEventAssignment: false,
      teamEventMembership: false,
    }),
    true,
  );
  assertEquals(
    canManageFlyerInScope({
      branchActive: false,
      scopeModes: ["branch"],
      directEventAssignment: false,
      teamEventMembership: false,
    }),
    false,
  );
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["event"],
      directEventAssignment: true,
      teamEventMembership: false,
    }),
    true,
  );
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["event"],
      directEventAssignment: false,
      teamEventMembership: false,
    }),
    false,
  );
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["team"],
      directEventAssignment: false,
      teamEventMembership: true,
    }),
    true,
  );
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["team"],
      directEventAssignment: false,
      teamEventMembership: false,
    }),
    false,
  );
});

Deno.test("transport assignments do not satisfy event flyer scope and cannot replace branch/team scope", () => {
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["event"],
      directEventAssignment: false,
      teamEventMembership: false,
    }),
    false,
  );
  assertEquals(
    canManageFlyerInScope({
      branchActive: true,
      scopeModes: ["transport"],
      directEventAssignment: false,
      teamEventMembership: false,
    }),
    false,
  );
});

Deno.test("flyers are editable only while the event is a private draft", () => {
  assertEquals(
    isEditablePrivateEvent({ status: "draft", visibility: "private" }),
    true,
  );
  assertEquals(
    isEditablePrivateEvent({ status: "published", visibility: "private" }),
    false,
  );
  assertEquals(
    isEditablePrivateEvent({ status: "draft", visibility: "public" }),
    false,
  );
  assertEquals(isEditablePrivateEvent(null), false);
});
