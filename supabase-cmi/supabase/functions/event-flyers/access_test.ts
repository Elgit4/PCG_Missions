import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canManageFlyerInScope,
  flyerProfileDenial,
  hasEligibleFlyerAssignment,
  isEditablePrivateEvent,
  isFlyerStaffAssignmentEligible,
  isFlyerTeamAssignmentEligible,
} from "./access.ts";

Deno.test(
  "flyer access rejects unprovisioned, inactive and temporary-password profiles",
  () => {
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
  },
);

Deno.test(
  "flyer management requires an active branch and a matching capability scope",
  () => {
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
  },
);

Deno.test(
  "flyer staff assignment eligibility uses the approved staff-role allowlist",
  () => {
    assertEquals(isFlyerStaffAssignmentEligible("owner"), true);
    assertEquals(isFlyerStaffAssignmentEligible("organizer"), true);
    assertEquals(isFlyerStaffAssignmentEligible("checkin"), true);
    assertEquals(isFlyerStaffAssignmentEligible("support"), true);
    assertEquals(isFlyerStaffAssignmentEligible("ushering"), false);
    assertEquals(isFlyerStaffAssignmentEligible("host"), false);
    assertEquals(isFlyerStaffAssignmentEligible("transport"), false);
    assertEquals(isFlyerStaffAssignmentEligible("unexpected-role"), false);
    assertEquals(
      hasEligibleFlyerAssignment(["transport", "support"]),
      true,
    );
    assertEquals(
      hasEligibleFlyerAssignment(["transport", "host"]),
      false,
    );
    assertEquals(hasEligibleFlyerAssignment(["transport"]), false);
  },
);

Deno.test(
  "flyer team assignment eligibility uses the approved team-role allowlist",
  () => {
    assertEquals(isFlyerTeamAssignmentEligible("organizer"), true);
    assertEquals(isFlyerTeamAssignmentEligible("ushering"), true);
    assertEquals(isFlyerTeamAssignmentEligible("support"), true);
    assertEquals(isFlyerTeamAssignmentEligible("owner"), false);
    assertEquals(isFlyerTeamAssignmentEligible("checkin"), false);
    assertEquals(isFlyerTeamAssignmentEligible("host"), false);
    assertEquals(isFlyerTeamAssignmentEligible("transport"), false);
    assertEquals(isFlyerTeamAssignmentEligible("unexpected-role"), false);
  },
);

Deno.test(
  "transport-only capability does not satisfy event flyer scope",
  () => {
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
  },
);

Deno.test(
  "flyers are editable only while the event is a private draft",
  () => {
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
  },
);
