# W2 review

- Date: 2026-10-28; architecture/code review: current task, self-review.
- Verdict: approved for phase checkpoint. Upstream files / SGP: none.
- Corrected during review: oblique outlet corners now sum independent face-normal convective fluxes;
  diagonal-neighbor interpolation incorrectly coupled the two speeds. GLSL reserved identifier fixed.
- Source boundary: only owned wind JS/GLSL/Specs/docs and benchmark explicit periodic configuration.
- Automated: 7/7 strict WebGL tests pass, including W1 regressions, oblique open uniform flow,
  forced Poiseuille at 8/16 cells (relative L2 <4%/<1.2%, fine error smaller), and obstacle wake.
- Wake: static 3×4×4 block; 24/32 downstream-domain lengths, 500 steps. Solids zero, finite output,
  center wake speed <75% side speed; probe difference <8% prescribed speed.
- CPU: mask concavity/rigid translation/union/ground and rejection tests passed; boundary classification
  and unit tests passed in the first combined run (GPU shader failure was subsequently repaired).
- Full buildRelease, buildTs and tsc passed. Scoped ESLint, Prettier, Markdown lint and diff checks passed.
- No claim of quantitative city validation, reflection-free exit or resolved wall turbulence.
- Open limitations: first-order outlet requires downstream buffer; constant LES without wall model;
  staircase center-sampled obstacles. These are documented scope limits, not silently removed findings.
