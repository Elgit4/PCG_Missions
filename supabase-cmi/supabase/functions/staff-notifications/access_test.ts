import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  notificationPageLimit,
  notificationProfileDenial,
  notificationRecipientScope,
  unreadNotificationRecipientScope,
} from "./access.ts";

Deno.test("notification access rejects missing, inactive and temporary-password profiles", () => {
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
});

Deno.test("notification list and read filters always bind to the authenticated recipient and branch", () => {
  const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const branchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  assertEquals(notificationRecipientScope(actorId, branchId), {
    recipient_user_id: actorId,
    branch_id: branchId,
  });
  assertEquals(unreadNotificationRecipientScope(actorId, branchId), {
    recipient_user_id: actorId,
    branch_id: branchId,
    read_at: null,
  });
});

Deno.test("notification page size is bounded to one through fifty", () => {
  assertEquals(notificationPageLimit(null), 30);
  assertEquals(notificationPageLimit("1"), 1);
  assertEquals(notificationPageLimit("50"), 50);
  assertEquals(notificationPageLimit("500"), 50);
  assertEquals(notificationPageLimit("0"), 1);
  assertEquals(notificationPageLimit("-4"), 1);
  assertEquals(notificationPageLimit("1.5"), 30);
  assertEquals(notificationPageLimit("not-a-number"), 30);
});
