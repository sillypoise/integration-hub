# Stage 7: Stripe source sandbox evidence

## Status

Blocked before implementation. No adapter or real sandbox synchronization has been delivered. Stages
1–6 remain complete. The public source and destination remain explicitly simulated.

## Approved scope revision

The maintainer approved Stripe test mode → existing simulated CRM, deferring the real HubSpot
adapter rather than opening another provider account merely to satisfy the original plan.

The revised exit gate still requires a real, opt-in Stripe read and verified simulated CRM
persistence, replay protection, strict response validation, bounded timeouts, safe rate-limit and
partial-failure handling, and synthetic fixture cleanup. The adapter and its credentials must stay
outside the public runtime. No claim of a real external CRM integration is permitted.

Admission decision (`SIMPLE-ADMIT-002/003`): reuse the existing mapping, queue, and simulated CRM.
Do not add another service, provider account, or generic adapter framework. A real destination can
be reconsidered only when the maintainer has sandbox access and a current evidence requirement.

## Observed blocker

- Unauthenticated HTTPS requests to Stripe's API and documentation site timed out. Explicit IPv4
  attempts to both endpoints also timed out after ten seconds, with no HTTP response (`000`).
- A read-only `GET https://api.stripe.com/v1/customers?limit=1`, using the locally configured
  test-mode key, redirect denial, and an eight-second deadline, failed to connect or timed out. The
  check did not print credentials or customer data. No response body was inspected.
- Authentication remains **unverified**, not rejected. The cause of the connectivity failure is
  unknown; these checks do not establish a Stripe outage or invalid credentials.
- No Stripe write/delete request was issued, no remote object was created by this attempt, and no
  key was copied to Railway, CI, documentation, or source control.

Confidence: high that these bounded checks did not establish connectivity; undetermined cause. This
is a blocked attempt, not integration evidence (`EPI-CLAIM-001/002`). The implementation-plan rule
to stop when sandbox access is impractical applies; credentials must not be moved into the public
deployment to work around the blocker (`SECCORE-SECR-003`).

## Resumption

Owner: repository maintainer. Recheck the same bounded, read-only authentication request from the
intended maintainer environment when Stripe connectivity is available. Proceed only after a
successful response. Then implement and validate the revised source-only flow and record actual
sandbox evidence before marking this stage complete.

Stage 8 public-demo hardening does not require a Stripe adapter and can proceed independently, while
this stage remains explicitly blocked. No application deployment or schema change is needed for this
scope/status documentation update.
