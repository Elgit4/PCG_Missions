import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isUuid,
  parseAreaCoverageCreate,
  parseServiceAreaCreate,
  parseServiceAreaPatch,
  parseTeamCreate,
  parseTeamMemberCreate,
  parseTeamMemberRole,
  parseTeamPatch,
} from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";
const staffId = "10000000-0000-4000-8000-000000000002";

Deno.test("team creation normalizes name and optional description", () => {
  const parsed = parseTeamCreate({
    branch_id: branchId,
    name: "  Follow-up Team  ",
    description: "  Coordinates visitor follow-up. ",
  });
  assert(parsed.ok);
  assertEquals(parsed.value, {
    branch_id: branchId,
    name: "Follow-up Team",
    description: "Coordinates visitor follow-up.",
  });
});

Deno.test("team creation rejects bad branch, invalid lengths and caller-controlled fields", () => {
  assertEquals(isUuid(branchId), true);
  assertEquals(isUuid("not-a-uuid"), false);
  assertEquals(parseTeamCreate({ branch_id: "bad", name: "Team" }).ok, false);
  assertEquals(parseTeamCreate({ branch_id: branchId, name: "X" }).ok, false);
  assertEquals(
    parseTeamCreate({ branch_id: branchId, name: "A valid team", is_active: false }).ok,
    false,
  );
  assertEquals(
    parseTeamCreate({ branch_id: branchId, name: "A valid team", description: "x".repeat(1001) }).ok,
    false,
  );
});

Deno.test("team patch accepts only ordinary editable fields", () => {
  assertEquals(parseTeamPatch({ name: "Youth Ministry", is_active: true }), {
    ok: true,
    value: { name: "Youth Ministry", is_active: true },
  });
  assertEquals(parseTeamPatch({ description: null }), {
    ok: true,
    value: { description: null },
  });
  assertEquals(parseTeamPatch({}), { ok: false, error: "Provide at least one valid team update." });
  assertEquals(parseTeamPatch({ branch_id: branchId }), { ok: false, error: "Provide at least one valid team update." });
  assertEquals(parseTeamPatch({ is_active: "false" }).ok, false);
});

Deno.test("team membership defaults to member and supports leader designation", () => {
  assertEquals(parseTeamMemberCreate({ staff_profile_id: staffId }), {
    ok: true,
    value: { staff_profile_id: staffId, membership_role: "member" },
  });
  assertEquals(parseTeamMemberCreate({ staff_profile_id: staffId, membership_role: "leader" }), {
    ok: true,
    value: { staff_profile_id: staffId, membership_role: "leader" },
  });
  assertEquals(parseTeamMemberCreate({ staff_profile_id: "bad" }).ok, false);
  assertEquals(parseTeamMemberCreate({ staff_profile_id: staffId, membership_role: "admin" }).ok, false);
  assertEquals(parseTeamMemberRole({ membership_role: "member" }), {
    ok: true,
    value: { membership_role: "member" },
  });
  assertEquals(parseTeamMemberRole({ membership_role: "pastor" }).ok, false);
});

Deno.test("service-area creation normalizes codes and validates branch scope", () => {
  assertEquals(parseServiceAreaCreate({
    branch_id: branchId,
    name: " Northern Area ",
    code: " north-1 ",
  }), {
    ok: true,
    value: { branch_id: branchId, name: "Northern Area", code: "NORTH-1" },
  });
  assertEquals(parseServiceAreaCreate({
    branch_id: branchId,
    name: "Main Area",
  }), {
    ok: true,
    value: { branch_id: branchId, name: "Main Area", code: null },
  });
  assertEquals(parseServiceAreaCreate({ branch_id: "bad", name: "Valid Area" }).ok, false);
  assertEquals(parseServiceAreaCreate({ branch_id: branchId, name: "Valid Area", code: "contains spaces" }).ok, false);
});

Deno.test("service-area patch allows deactivation and code removal only", () => {
  assertEquals(parseServiceAreaPatch({ is_active: false, code: null }), {
    ok: true,
    value: { is_active: false, code: null },
  });
  assertEquals(parseServiceAreaPatch({ code: "south" }), {
    ok: true,
    value: { code: "SOUTH" },
  });
  assertEquals(parseServiceAreaPatch({ branch_id: branchId }).ok, false);
  assertEquals(parseServiceAreaPatch({ is_active: 0 }).ok, false);
});

Deno.test("area coverage accepts one staff profile identifier only", () => {
  assertEquals(parseAreaCoverageCreate({ staff_profile_id: staffId }), {
    ok: true,
    value: { staff_profile_id: staffId },
  });
  assertEquals(parseAreaCoverageCreate({ staff_profile_id: staffId, branch_id: branchId }).ok, false);
  assertEquals(parseAreaCoverageCreate({ staff_profile_id: "not-a-uuid" }).ok, false);
  assertEquals(parseAreaCoverageCreate(null).ok, false);
});
