# Design polish: local review

Status: implemented and locally verified; not committed or deployed. The hosted release is
unchanged.

## Direction and scope

A warmer operations console: forest surfaces, restrained lime accents, consistent line icons,
stronger typography, and a more distinct pipeline illustration. Cards, inputs, run links, empty
states, and mobile navigation share the same visual treatment. Run outcome borders reuse the
existing pending/attention/succeeded classification; a failed run no longer gets a success-colored
border. Labels remain the primary status signal.

This is a presentation change, not a feature expansion. Routes, authorization, requests, polling,
retry behavior, persistence, and simulation disclosures are unchanged. Reuse the existing stylesheet
and a small fixed SVG set rather than introducing a component library, font download, or animation
framework. There are no new external asset requests or backend operations.

## Evidence

- `just validate`: 251 unit/integration tests and 36 browser checks passed, including invalid
  inputs, authorization denial, loading, stale snapshots, retries, terminal failure, and CSP
  enforcement.
- After final CSS refinements, formatting, lint, typecheck, production build, and all 36 browser
  checks passed again.
- New boundary checks exercise landing, empty overview, controls, and runs at 320, 768, and 1440 CSS
  pixels in both browser projects. Navigation remains keyboard-focusable with a visible outline; the
  document does not overflow horizontally. Run tables retain their intentional scroll region.
- Reviewed generated desktop/mobile screenshots for landing, overview, controls, run detail, and
  exhausted recovery, including narrow and tablet layouts. Screenshots are local test artifacts
  under `test-results/`; before-change desktop captures are in `/tmp/p1-design-before/`.
- Checked public JavaScript increased from 1,026,188 to 1,028,315 bytes (+2,127 bytes, about 0.21%).
  The bundle and dependency audits passed. This is an asset-size observation, not a latency claim.

## Second detail pass

- Narrow connection diagrams now stack source and destination in reading order, with a vertical
  connector and readable labels instead of three squeezed columns.
- Mobile navigation retains aligned icons; secondary metric text and timestamps are more legible.
- Refresh actions stay on one line, timestamp digits align, and table rows highlight on keyboard
  focus as well as hover.
- Confirmation checkboxes have a square visual control inside the existing 44-pixel label target.
- Disabled buttons no longer receive enabled hover colors. Reduced-motion behavior is retained.
- Short desktop windows can scroll the sidebar to reach its footer links with the keyboard.
- Formatting, lint, typecheck, production build, and 38 browser checks passed. Added checks cover
  disabled-hover styling, reduced motion, and keyboard access in a 400-pixel-high desktop window.
  The existing negative, recovery, and security browser paths passed unchanged. No backend code,
  dependencies, or runtime state were added in this pass.

Visual preference still needs maintainer review; this is not a comprehensive accessibility audit.
Preview with `just dev` before approving a hosted release. No real provider calls were made.

Guide trace: `SIMPLE-ADMIT-002/003` existing styles and bounded icons; `CONTRACT-COMP-003` unchanged
public behavior; `SAF-11` negative and viewport-boundary checks; `EPI-CLAIM-002` local versus hosted
verification. The browser tour scopes `no-await-in-loop` suppression to sequential navigation on one
owned page; parallel navigation would race its state (`SAF-17`). Assertion density remains
unmeasured.
