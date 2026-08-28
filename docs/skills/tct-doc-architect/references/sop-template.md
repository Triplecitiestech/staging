# SOP Templates

HTML-oriented skeletons for IT Glue document bodies. Use these as the shape; fill with real content. Link with ID-based URLs: `https://triple-cities-tech.itglue.com/6942365/docs/<id>`.

**Read section 6 of `tct-documentation-standard.md` before using these.** The structure below is not stylistic preference — IT Glue builds its left-hand navigation pane from the `<h2>`/`<h3>` hierarchy, and numbered sections are what make the document referenceable.

## Rules these skeletons encode

- Top-level sections are numbered `<h2>`: `1) Purpose`, `2) Scope`, `3) Process Flow Overview`.
- Sub-blocks within a section are lettered `<h3>`, with the owning role named: `A. Record the Win - Rio`.
- Never go deeper than `<h3>`.
- Every procedure step is an `<li><p>` in an `<ol>`, **one line long**, opening with a bolded imperative label.
- Caveats, examples and reasoning go in a nested `<ul>` inside the step — never fused into the instruction. Prefix reasons with `<em>Why:</em>`.
- Step numbering continues across sub-blocks via `<ol start="N">`.
- `<hr>` between every top-level section.

## Hub SOP skeleton

```html
<h2>1) Purpose</h2>
<p>This is the main <System> SOP for Triple Cities Tech and the starting point for any <System> work.</p>
<p><strong>The rule that matters most: <one-sentence statement of the single most important principle>.</strong></p>
<hr>
<h2>2) What <System> Is</h2>
<p><What it is, what it is used for, and what it is explicitly not used for.></p>
<hr>
<h2>3) Process Flow Overview</h2>
<p><strong>Standard Workflow:</strong><br>Stage &rarr; Stage &rarr; Stage &rarr; Stage</p>
<hr>
<h2>4) Roles &amp; Responsibilities</h2>
<ul>
  <li><p><strong>&lt;Role&gt;</strong> - &lt;what they own&gt;</p></li>
</ul>
<hr>
<h2>5) Required Sequence</h2>
<p><Note which steps are mandatory and most often missed.></p>
<ol>
  <li><p><strong>&lt;Step&gt;.</strong> Follow <a href="<url>">System - <Sub-SOP></a>. <What it covers.></p></li>
</ol>
<hr>
<h2>6) Sub-SOPs</h2>
<ul>
  <li><p><a href="<url>">System - <Sub-SOP></a> - <one line></p></li>
</ul>
<hr>
<h2>7) Edge Cases</h2>
<ul>
  <li><p><strong>&lt;Condition&gt;.</strong> &lt;What to do.&gt;</p></li>
</ul>
<hr>
<h2>8) Completion Requirements</h2>
<ul>
  <li><p><Verifiable outcome.></p></li>
</ul>
<hr>
<h2>9) Official Vendor Resources</h2>
<ul>
  <li><p><a href="<vendor-url>"><Vendor - Page title></a> - what it sources. Verified <date>.</p></li>
</ul>
```

## Sub-SOP skeleton

```html
<h2>1) Purpose</h2>
<p>This SOP covers <one job>. It is part of <a href="<hub-url>">System - <...> (START HERE)</a>.</p>
<p><strong>The rule that matters most: <key principle or common-failure warning>.</strong></p>
<p><strong>Process flow:</strong> Stage &rarr; <strong>Current Stage</strong> &rarr; Stage</p>
<p><strong>You are here:</strong> Current Stage.</p>
<ul>
  <li><p><strong>Previous stage</strong> - <a href="<url>"><title></a></p></li>
  <li><p><strong>Next stage</strong> - <a href="<url>"><title></a></p></li>
</ul>
<hr>
<h2>2) Scope</h2>
<p><What this applies to.></p>
<p><strong>Out of scope:</strong> <what it does not cover, and where that lives instead.></p>
<hr>
<h2>3) Roles &amp; Responsibilities</h2>
<ul>
  <li><p><strong>&lt;Role&gt;</strong> - &lt;what they own in this SOP&gt;</p></li>
</ul>
<hr>
<h2>4) Prerequisites</h2>
<ul>
  <li><p><Condition that must be true before starting.></p></li>
</ul>
<hr>
<h2>5) Procedure</h2>
<h3>A. &lt;Sub-block label&gt; - &lt;Owning role&gt;</h3>
<ol>
  <li><p><strong>&lt;Imperative label.&gt;</strong> &lt;One line.&gt;</p></li>
  <li>
    <p><strong>&lt;Imperative label.&gt;</strong> &lt;One line.&gt;</p>
    <ul>
      <li><p>&lt;Caveat or example.&gt;</p></li>
      <li><p><em>Why:</em> &lt;reason this step matters&gt;</p></li>
    </ul>
  </li>
</ol>
<h3>B. &lt;Sub-block label&gt; - &lt;Owning role&gt;</h3>
<ol start="3">
  <li><p><strong>&lt;Imperative label.&gt;</strong> &lt;Numbering continues across sub-blocks.&gt;</p></li>
</ol>
<hr>
<h2>6) If This Goes Wrong</h2>
<ul>
  <li><p><strong>&lt;Symptom.&gt;</strong> &lt;What to do.&gt;</p></li>
</ul>
<p><strong>Escalate to &lt;person&gt;</strong> when &lt;conditions&gt;.</p>
<hr>
<h2>7) Completion Checklist</h2>
<ul>
  <li><p><Verifiable outcome of each step, in a few words.></p></li>
</ul>
<hr>
<h2>8) Official Vendor Resources</h2>
<ul>
  <li><p><a href="<vendor-url>"><Vendor - Page title></a> - sources steps &lt;n&gt;. Verified &lt;date&gt;.</p></li>
</ul>
<hr>
<h2>9) Related SOPs</h2>
<ul>
  <li><p><a href="<url>">System - <...> (START HERE)</a> - the hub</p></li>
  <li><p><a href="<url>">System - <sibling></a> - <relationship></p></li>
</ul>
```

## Worked example

[Processing an Accepted Quote and Collecting Payment](https://triple-cities-tech.itglue.com/6942365/docs/24448582) (doc 24448582) is the first SOP written to this structure. Read it before authoring a new one.

## Notes

- Anchor text = the target doc's title. Href = its ID-based URL (stable across renames).
- Tables for three-or-more-column data (decision matrices, policy thresholds, status mappings). Two-column term-and-definition lists read better as bolded-term bullets.
- Do not use the Autotask ticket format (Actions Taken / Root Cause / Resolution / Next Steps / Status) in SOPs; that format is for tickets and time entries only.
