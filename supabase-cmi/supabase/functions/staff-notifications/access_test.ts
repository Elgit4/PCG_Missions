import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  notificationBranchAccess,
  notificationPageLimit,
  notificationProfileDenial,
  notificationReadScope,
  notificationRecipientScope,
} from "./access.ts";

Deno.test(
  "notification access rejects missing, inactive and temporary-password profiles",
  () => {
    assertEquals(notificationProfileDenial(null), "not_active");
    assertEquals(
      notificationProfileDenial({
        account_status: "inactive",
        must_change_password: false,
      }),
      "not_active",
    );
    assertEquals(
      notificationProfileDenial({
        account_status: "active",
        must_change_password: true,
      }),
      "password_change_required",
    );
    assertEquals(
      notificationProfileDenial({
        account_status: "active",
        must_change_password: false,
      }),
      null,
    );
  },
);

Deno.test(
  "notification recipient filter is scoped to the authenticated user and branch",
  () => {
    const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const branchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    assertEquals(notificationRecipientScope(actorId, branchId), {
      recipient_user_id: actorId,
      branch_id: branchId,
    });
  },
);

Deno.test(
  "notification read mutation is constrained by ID, authenticated recipient and branch",
  () => {
    assertEquals(
      notificationReadScope(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ),
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        recipient_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        branch_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    );
  },
);

Deno.test(
  "notification access requires both an active branch and current staff assignment",
  () => {
    assertEquals(notificationBranchAccess(true, true), true);
    assertEquals(notificationBranchAccess(false, true), false);
    assertEquals(notificationBranchAccess(true, false), false);
    assertEquals(notificationBranchAccess(false, false), false);
  },
);

Deno.test(
  "notification page size is bounded to one through fifty",
  () => {
    assertEquals(notificationPageLimit(null), 30);
    assertEquals(notificationPageLimit("1"), 1);
    assertEquals(notificationPageLimit("50"), 50);
    assertEquals(notificationPageLimit("500"), 50);
    assertEquals(notificationPageLimit("0"), 1);
    assertEquals(notificationPageLimit("-4"), 1);
    assertEquals(notificationPageLimit("1.5"), 30);
    assertEquals(notificationPageLimit("not-a-number"), 30);
  },
);
