# PCG Missions — Hubtel Business SMS Integration and Go-Live Runbook

**Selected provider:** Hubtel Business SMS  
**Integration workspace:** `supabase-cmi/`  
**Adapter:** `supabase/functions/_shared/sms/hubtel.ts`  
**Current status:** Provider adapter and unit tests are source-controlled. No SMS endpoint, outbox dispatcher, live credentials, sender ID or hosted configuration is active. Live dispatch is disabled by default.

## 1. Provider selection

Hubtel Business SMS is the recommended first provider for PCG Missions because:
- Hubtel publishes a current developer API for single, batch and personalized SMS.
- It supports a Ghana business account and sender-ID approval flow.
- It documents delivery status lookup by provider message ID.
- Its SMS service explicitly lists churches among its customer use cases.
- The business SMS API uses Basic authentication and a POST request, avoiding credentials in URL query strings.

This is a provider recommendation, not evidence that the church already has a Hubtel account, sender approval, credit balance or contract. Before procurement, verify current route pricing, sender-ID availability, throughput, data-processing terms, support SLA and Ghana carrier delivery with Hubtel.

Official references:
- [Hubtel developer portal](https://code.hubtel.com/docs)
- [Hubtel Business SMS API](https://code.hubtel.com/docs/api/v1/sms)
- [Send an SMS](https://code.hubtel.com/docs/api/v1/sms/send-sms)
- [SMS delivery and errors](https://code.hubtel.com/docs/guides/sms-delivery)
- [Hubtel SMS pricing and routes](https://hubtel.com/consumer/sms)
- [Hubtel go-live checklist](https://code.hubtel.com/docs/get-started/go-live)

## 2. Business account and sender setup

The church's authorized representative must:
1. Create or join the church's Hubtel business/merchant account through Hubtel's official onboarding.
2. Confirm the business account is approved for Programmable/Business SMS.
3. Request sender-ID approval. Sender IDs are limited to 11 alphanumeric characters in the documented business SMS API. `PCGMISSIONS` is a possible candidate only; it is not approved and must not be used until Hubtel and the church approve it.
4. Create SMS API credentials for the approved sender ID in Hubtel's developer portal.
5. Fund the business SMS balance through the Hubtel business account.
6. Confirm the business SMS host, route selection and current rate with Hubtel before any live test.

Do not use personal-account credentials for the church's business messaging. Do not use Hubtel's GET send endpoint; its query parameters can expose secrets in logs.

## 3. Server-side secret configuration

The adapter reads only Edge Function environment secrets:

| Secret | Purpose |
|---|---|
| `HUBTEL_SMS_CLIENT_ID` | Hubtel Business SMS API ID |
| `HUBTEL_SMS_CLIENT_SECRET` | Hubtel Business SMS API key |
| `HUBTEL_SMS_SENDER_ID` | Hubtel-approved sender ID |
| `CMI_SMS_LIVE_ENABLED` | Exact string `true` is required to allow the adapter's send method |

Set secrets only in the approved Supabase Edge Function environment after the hosted CMI project is explicitly authorized. Never commit them, place them in frontend environment variables or paste them into chat. For local development, use test credentials only in a local untracked secrets file and a verified Hubtel sandbox host; do not assume production credentials or endpoint are sandbox-safe.

Missing credentials or a missing live flag must leave dispatch disabled. The adapter has no route from the browser and is not an endpoint.

## 4. API contract implemented by the adapter

Business send:
- Host: `https://sms.hubtel.com`
- Method: `POST /v1/messages/send`
- Authentication: HTTP Basic using `Client ID:Client Secret`.
- JSON body fields: `From`, `To`, `Content`.
- `To` is international digits without the leading plus, e.g. `+233241234567` becomes `233241234567`.
- `From` must be the approved sender ID (11 alphanumeric characters or fewer).
- Provider response `status = 0` plus a valid `messageId` means accepted for onward delivery, not delivered.

Status lookup:
- `GET /v1/messages/{messageId}` on the same business host with the same credentials.
- Provider statuses are mapped to internal accepted/pending/delivered/failed/suppressed/unknown states.
- A successful send response is never displayed as delivered.

The adapter deliberately does not implement bulk dispatch itself. The CMI outbox must create one eligible message per recipient so consent, suppression, scope, idempotency, campaign approval and budget checks can be repeated immediately before each dispatch.

## 5. Duplicate prevention and uncertain submissions

Hubtel's documented SMS send request does not provide an idempotency key in the implemented request contract. Therefore:
- A local outbox must claim a message exactly once before invoking the provider.
- If a send request times out or the connection fails after submission may have occurred, the adapter returns `HUBTEL_SMS_SUBMISSION_UNCERTAIN` and marks it non-retryable.
- Do not blindly resubmit an uncertain send; reconcile with Hubtel support/account records before manual retry.
- Status lookup is safe to retry because it does not create a new message.
- Store provider message IDs and distinguish accepted from final delivery.

## 6. Provider status and callback decision

The current Hubtel SMS documentation instructs clients to store the `messageId` and check delivery status with the message-status endpoint. Hubtel's published callback reference does not define a signed SMS delivery webhook contract. This implementation therefore uses status polling as the documented baseline and does not invent webhook signature validation or claim signed SMS callbacks are available.

A later webhook implementation requires a provider-confirmed SMS callback payload, source/authentication controls, replay semantics and a verified production contract. Payment callback rules must not be reused for SMS.

## 7. Church policy and activation gates

Hubtel integration is not permission to message anyone. Before live dispatch, the church must approve and configure:
- D-09: provider, consent/lawful-basis evidence, opt-out handling, quiet hours, sender ID and templates.
- D-10: exact automated trigger catalogue and recipient class.
- D-11: campaign creator/approver/sender separation, caps and spend limits.
- R-06–R-09: individual, bulk and automation permissions.
- applicable R-05 contact identity access and R-12 export/privacy controls.
- approved templates, service-message classification and sensitive-content exclusions.
- branch/team/event audience rules and provider-account funding owner.

The backend must recheck recipient eligibility and suppression at dispatch time, not trust a UI-selected list. Prayer/care narratives, credentials and authentication codes must never be sent. No role grants are seeded; SMS capabilities remain ineffective until approved grants are provisioned.

## 8. Live readiness checklist

The provider is **not live** until every item is verified:
- [ ] Hubtel business account approved for SMS.
- [ ] Approved sender ID and credentials issued.
- [ ] Current Ghana route and rate confirmed in writing.
- [ ] Account balance and spending owner confirmed.
- [ ] Stakeholder decisions D-09/D-10/D-11 and R-06–R-09 recorded in the decision register.
- [ ] Consent evidence, suppression and opt-out workflow implemented and tested.
- [ ] Campaign approval snapshot and distinct approver enforced.
- [ ] Per-message outbox, idempotency, bounded queue and retry rules implemented.
- [ ] Provider status polling and reconciliation job implemented.
- [ ] Per-campaign and global budget reservation/reconciliation implemented.
- [ ] Platform rate limits, monitoring and emergency pause implemented.
- [ ] Authorized test recipient and exact test content approved.
- [ ] Explicit production deployment and live-send authorization recorded.

Until then, adapter tests use mocked fetch responses only. No messages are sent and no provider credentials are configured.

## 9. Implementation references

- CMI v2.1 requirements: SMS communication and privacy requirements.
- [Roles, Permissions and Security](../../../../docs/02_ROLES_PERMISSIONS_AND_SECURITY.md), §10.
- [Stakeholder Decision Register](../../docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md), R-06–R-09 and D-09–D-11.
- [Role, Capability and Scope Matrix](../../docs/07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md), SMS action separation.
- [Requirements-Driven Engineering Baseline](../../docs/25_CMI_REQUIREMENTS_DRIVEN_ENGINEERING_BASELINE.md), SMS implementation contract.
