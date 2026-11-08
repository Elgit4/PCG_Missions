# CMI Follow-up — Event Idempotency Ledger Design

**Status:** Ledger schema and server-side helper merged to `main`; not a deployed endpoint or approved operational policy  
**Related:** [Event Transaction API Contract](17_EVENT_TRANSACTION_API_CONTRACT.md), [Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md), [PR #8](https://github.com/Elgit4/PCG_Missions/pull/8)

## 1. Problem

A unique request key prevents duplicate rows, but it does not by itself distinguish a legitimate retry from a client reusing the same key with a different payload. A safe mutation API must:

- Return the original operation receipt for the same key and same normalized request.
- Reject the same key with a different normalized request using HTTP 409.
- Commit the domain mutation and idempotency receipt in one database transaction.
- Ensure two concurrent first attempts cannot both claim the same scoped key.

## 2. Ledger model

The draft adds `public.event_idempotency_receipt` with:

- Event and branch scope.
- An allowlisted operation name.
- Caller class (`public` or `staff`).
- A server-resolved staff actor for staff operations; public registration has no actor ID.
- A UUID idempotency key.
- A 32-byte request digest and positive digest-key version.
- An allowlisted resource type and the resulting resource UUID.
- The successful HTTP status and creation timestamp.

The composite unique constraint uses PostgreSQL 15+ `UNIQUE NULLS NOT DISTINCT`. That is important for public requests: NULL actor IDs are treated as equal, so the same public key cannot be inserted twice for the same event, branch, operation and caller class. Staff requests are separately scoped by their authenticated actor ID.

The resource ID is polymorphic and therefore has no single foreign key. The trusted transaction must verify that the referenced row exists, belongs to the same event/branch, and matches the operation/resource-type pairing before inserting the receipt. The schema enforces the operation/resource-type pairing but cannot enforce a polymorphic foreign key without separate typed receipt tables.

## 3. Digest construction and key handling

The ledger stores a versioned **HMAC-SHA-256** digest, not a plain hash. A plain hash of a low-entropy payload containing a phone number or name could be vulnerable to offline guessing.

The trusted server must:

1. Validate and normalize the request using the endpoint's strict allowlist.
2. Construct a canonical payload including the operation, event, branch, caller class, authenticated actor (for staff), and every normalized field that can affect the mutation.
3. Serialize deterministically (stable property order, normalized strings, canonical number/date representation; no ignored fields).
4. Compute HMAC-SHA-256 using a server-only secret for the recorded key version.
5. Never accept a digest or actor identity from the browser.

Key rotation must preserve the ability to verify retries against old receipts. Keep each HMAC verification key available until all receipts using that version have expired under an approved retention schedule. The schema intentionally does not choose a TTL; D-13 must define idempotency retention and key retirement together.

## 4. Transaction algorithm

For every mutation, the eventual server endpoint or private transaction function must:

1. Authenticate the caller where required and derive actor/branch from trusted records.
2. Validate the request and calculate the normalized HMAC digest.
3. Start a transaction and acquire the event/transport/closeout locks in the order defined by document 17.
4. Attempt to claim the scoped idempotency key. The unique constraint is the concurrency arbiter.
5. If the key already exists, read the receipt under the transaction:
   - Same digest and same key version: return the original resource receipt without repeating the mutation.
   - Different digest: return HTTP 409; do not mutate either resource.
   - Different key version: recompute using the receipt's stored key version before comparing. Never assume different versions mean different requests.
6. For a new key, perform the domain mutation, verify resource/event/branch pairing, and insert the receipt in the same transaction.
7. Commit both together. If any step fails, roll back both the resource mutation and receipt.

Use a savepoint or a database-native conflict-handling pattern that safely recovers from a unique violation without leaving the transaction aborted. A bare failed INSERT followed by SELECT in the same transaction is not valid PostgreSQL transaction handling.

## 5. Security boundary

- The table has RLS enabled and all direct privileges revoked from `PUBLIC`, `anon` and `authenticated`.
- No browser client may insert, read or alter receipts directly.
- Future private transaction functions must expose only the exact operation they implement, validate every argument, use a fixed `search_path`, revoke default PUBLIC execution, and receive explicit least-privilege EXECUTE grants only after R/D approvals.
- The receipt stores no raw request body, attendee name, phone, email, consent text or arbitrary response JSON.
- The resource ID is an internal UUID, not a public token. Public APIs must return only their approved minimal projection.
- The HMAC secret is stored only in server-side secret management; it must never be included in a client bundle, logs or repository files.

## 6. Deliberate limitations

- The schema does not create any event write endpoint or transaction function.
- Only public registration is modeled as an anonymous caller operation. Public transport reservation remains blocked pending D-06.
- Offline/device caller classes are omitted pending D-08 device identity and sync approval.
- The table has no expiry/cleanup job until D-13 approves retention.
- The ledger cannot independently prove that the stored digest was correctly computed; that is a trusted-server responsibility and requires function-level tests.
- This does not replace event row locking, capacity checks, authorization, rate limiting, audit events or consent evidence.

## 7. Validation

The event-domain pgTAP suite checks table/column/index presence, RLS and closed browser grants, public/staff actor scope, key uniqueness, digest length and key version, operation allowlists, operation/resource pairing, successful status range and event/branch integrity.

The merged PR #8 head passed [CI run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750), including the full isolated CMI suite (**129 pgTAP assertions across four suites**) and the Deno idempotency-helper tests. The event/idempotency database suite contains 71 assertions. These are schema/helper-level tests only; endpoint replay, payload-conflict and concurrent-claim integration tests remain required before the API can be implemented.

## 8. Implementation gate

The receipt ledger is a technical prerequisite, not approval to enable event mutations. Public registration and staff event write paths remain blocked by D-05, D-06 and applicable R-01–R-12/D-01 decisions. Retention and key retirement remain blocked by D-13. No hosted Supabase project is modified by this draft.


## 9. Source-control verification (2026-11-08)

PR #8 is merged to `main` as [commit d091a894](https://github.com/Elgit4/PCG_Missions/commit/d091a89404165d11e96949b5aa7d35a646a89db8). Its exact PR head `c80a29a46a8a693449d66b209c84e2ba6894209a` passed [workflow run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750).

The receipt relation, canonical JSON/HMAC helper and their database/unit tests are source-control integrated. They do not constitute a live transaction endpoint. Atomic claim/replay/conflict semantics, resource validation within the event/branch, consent linkage, retention/key retirement approval, and production security review remain required. No hosted Supabase project has been modified or linked.
