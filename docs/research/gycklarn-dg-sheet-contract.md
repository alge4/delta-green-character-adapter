# Gycklarn Delta Green Character Sheet binary and layout contract

## Decision summary

The first spreadsheet adapter target is the **Gycklarn unofficial Agent sheet** as exported from Google Sheets to Office Open XML (`.xlsx`) and OpenDocument Spreadsheet (`.ods`). The live Google workbook is not a stable binary: it can change without notice. Compatibility must be an adapter configuration/provenance claim backed by structural fingerprinting of the downloaded file, not by the Google document ID.

`.xlsx` is the contract authority. It preserves native boolean checkboxes, shared formulas, and cached calculated values. `.ods` is the same single-sheet layout with a lossy encoding: checkboxes become `FALSE()` formulas with numeric `0` caches, shared formulas are expanded, and argument separators become ODS/LibreOffice semicolons. A later mapping ticket can treat the two formats as one layout with two codecs.

The sheet contains no schema discriminator. Fingerprint a candidate file as this layout when all of the following hold, then map cells; do not require byte-for-byte identity with the blank or Caleb downloads:

1. exactly one worksheet, name `Agent` (`xl/workbook.xml` `<sheet name="Agent" sheetId="1"/>`; ODS `table:name="Agent"`);
2. attribution `AR80` = `This is a work of fiction. Unofficial character sheet by /u/gycklarn`;
3. form numbers `K95` = `315` and `AL95` = `112382`;
4. `mergeCells/@count="298"` with the region merges listed below;
5. the eleven formula cells `L13:L18`, `N20`, `N21`, `N22`, `T22`, `T23` with the texts pinned here;
6. the 57 boolean checkbox cells pinned here (xlsx `t="b"`).

Caleb is the first filled golden fixture, not a complete schema. Import should map completed Agent meaning into canonical schema `1.0.0`, retain sheet-only presentation and unmapped blobs under `extensions.gycklarnDgSheet`, preserve explicit values, calculate only missing derived values, and diagnose contradictions. Printed skill defaults live in title strings such as `Accounting (10%)`; an empty percent cell is “use the printed default,” not zero.

## Evidence and fixture

Inspected read-only; not vendored:

| File | Role | Bytes | SHA-256 |
|---|---|---|---|
| `C:\Users\alge4\Downloads\Copy of Delta Green Character Sheet.xlsx` | Blank `.xlsx` template | 18412 | `197F11F174BBB0696F6528601CF57B4C5B8E20B80850A2E1B509B8E4DF91B94F` |
| `C:\Users\alge4\Downloads\Copy of Delta Green Character Sheet.ods` | Blank `.ods` sibling | 19486 | `63BDB2CFA166D732D0CD8002341E0A4687B381FBEECBE4A304A1178359242820` |
| `C:\Users\alge4\Downloads\Delta Green Character Sheet - Alge.xlsx` | Filled Caleb `.xlsx` | 19940 | `1544C02643F62A0BDED260056B23F7F086DDD61973829DCEB036C948E421270D` |

Secondary live pointers, not binary authorities:

- Template: [Google Sheet `18aq5sZ68FbFhcIURlto5SpJUE9BNj9KEI2ypD2J3_7Y`](https://docs.google.com/spreadsheets/d/18aq5sZ68FbFhcIURlto5SpJUE9BNj9KEI2ypD2J3_7Y/edit), HTML title `Delta Green Character Sheet : Agent`.
- Filled copy: [Google Sheet `1A6dcbR5qWZ3r4s4OUx8gW5BaShIfEQ-z8HloO5Cgqww`](https://docs.google.com/spreadsheets/d/1A6dcbR5qWZ3r4s4OUx8gW5BaShIfEQ-z8HloO5Cgqww/edit).

Primary XML cited below is from the blank `.xlsx` unless a Caleb or ODS difference is named. Both `.xlsx` files are Google Sheets OOXML exports: one visible sheet, empty `<definedNames/>` and `<calcPr/>`, no `docProps`, no `calcChain.xml`, empty `xl/drawings/drawing1.xml`, and an empty threaded-comments person list. The blank `.ods` declares `application/vnd.oasis.opendocument.spreadsheet`, `office:version="1.2"`, one table, and `meta:generator` `LibreOfficeDev/6.0.5.2$Linux_X86_64 LibreOffice_project/` (`META-INF/manifest.xml`, `meta.xml`).

## Package and sheet boundary

The adapter's required first input is a workbook with the `Agent` sheet. Extra sheets, if a later export adds them, are out of this pin and should be warned and ignored.

Used grid is `A1:AR97`. Column `A` and row spacers are chrome. There are no data validations, no sheet protection, and no defined names. Conditional formatting exists only on distinguishing features `N13:X18`:

```text
AND(OR(H13>12,H13<9),AND(ISBLANK(N13),NOT(ISBLANK(H13))))
```

That rule is UI, not Agent data.

Blank and Caleb share the same 298 merge set (order in `sheet1.xml` differs; the set is identical). ODS represents the same geometry with `table:number-columns-spanned` / `table:number-rows-spanned` instead of `mergeCells`.

## Layout fingerprint labels

Stable printed strings from `xl/sharedStrings.xml` (blank uniqueCount 125). Keep these as fingerprint/label text, including typos:

- Header: `DELTA GREEN`.
- Section titles: `PERSONAL DATA`, `STATISTICAL DATA`, `PSYCHOLOGICAL DATA`, `APPLICABLE SKILL SETS`, `INJURIES`, `EQUIPMENT`, `REMARKS`.
- Skill-title typos that identify this revision: `Heavy Machincery (10%)`, `Crimonology (10%)`, `Archeology (0%)`.
- Injury helper typo: `Has First Aid been attemped since the last injury?`.
- Footer: `DD`, `UNITED STATES FORM`, `TOP SECRET//ORCON//SPECIAL ACCESS REQUIRED-DELTA GREEN`, `AGENT DOCUMENTATION SHEET`.
- Skill-fail instruction at `C46`: `Check a box when you attempt to use a skill and fail. After the session, add 1D4-1 to each checked skill and erase all checks.`

## Boolean / checkbox encoding

### `.xlsx`

Checkboxes are ordinary cells with `t="b"` and `<v>0</v>` or `<v>1</v>`. They are not form controls or drawings. Unchecked is boolean false (`0`); checked is boolean true (`1`). The 57 refs are identical on blank and Caleb; Caleb flips only `F9` to true.

| Role | Cells |
|---|---|
| Sex F / M / other | `C9`, `F9`, `I9` |
| Violence incidents | `AC26`, `AD26`, `AE26` |
| Helplessness incidents | `AL26`, `AM26`, `AN26` |
| First aid attempted | `X55` |
| Skill fail marks | every `C`/`T`/`AF` skill-grid fail cell listed in the skill table below (47 cells) |

`I9` has no shared-string label; `F` and `M` sit in `D9` and `G9`. `K9:O9` is the other-sex write-in (empty on both files). The three sex booleans are independent in the file; nothing enforces a single choice.

Unnatural (`AF38`) and the five typed-family continuation rows (`C33` Art, `AF30` Science, `T38` Military Science, `C39` Craft, `T44` Pilot) have **no** fail checkbox.

### `.ods`

The same checkbox cells are **not** `office:boolean-value`. LibreOffice/Google export writes `office:value-type="float" office:value="0" table:formula="of:=FALSE()"` with display text `0`. A checked box on a later filled `.ods` should be expected as `of:=TRUE()` / `1`, but this pin has no filled `.ods` to prove that. Adapter code must accept xlsx booleans and ODS `FALSE()`/`TRUE()` formulas as the same Adaptation Evidence / fail-mark / sex encoding.

## Formula-cache behavior

Eleven formula cells exist on both `.xlsx` files. Formula text is identical; only cached `<v>` values change after stats are filled. There is no `calcChain.xml`. Shared formula `si="1"` is declared on `L13` with `ref="L13:L18"`; `L14:L18` store `<f t="shared" si="1"/>` with empty text.

| Cell | `.xlsx` formula | Blank cache | Caleb cache | Meaning |
|---|---|---|---|---|
| `L13:L18` | shared `(H13*5)` | `0` | `40`,`50`,`70`,`85`,`50`,`65` | Stat ×5 display. Not independent Agent data. |
| `N20` | `ROUNDUP((H13+H14)/2,0)` | `0` | `9` | Maximum HP. |
| `N21` | `H17` | `t="str"` empty | `t="n"` `10` | Maximum WP = POW. Cache type flips after calculation. |
| `N22` | `99-AP38` | `99` | `99` | Maximum SAN = 99 − Unnatural. Unnatural `AP38` is empty on both files. |
| `T22` | `H17*5` | `0` | `50` | Current SAN, formula-driven from POW. |
| `T23` | `IF(OR(ISBLANK(T22),ISBLANK(H17)),"[Missing POW or SAN]",IF(MOD(T22,H17)=0,T22-H17,T22-MOD(T22,H17)))` | `t="str"` `[Missing POW or SAN]` | `t="n"` `40` | Current BP from current SAN and POW. |

`T20` (current HP) and `T21` (current WP) are **inputs**, not formulas. Both are empty on Caleb. `N23` (maximum BP column) is also an empty input with no formula.

ODS equivalents (blank `content.xml`):

- `L13`…`L18` expanded to `of:=([.H13]*5)` … `of:=([.H18]*5)`, cache `0`, display `0%`.
- `N20` `of:=ROUNDUP(([.H13]+[.H14])/2;0)` cache `0`.
- `N21` `of:=[.H17]` cache float `0` (xlsx cached an empty string).
- `N22` `of:=99-[.AP38]` cache `99`.
- `T22` `of:=[.H17]*5` cache `0`.
- `T23` same IF/MOD logic with `[.T22]` / `[.H17]` refs and `;` separators; cache `[Missing POW or SAN]`.

Import rules for these cells:

1. Prefer an explicit cached numeric value when present.
2. Recalculate only when the cache is missing, the placeholder string `[Missing POW or SAN]`, or the formula was deleted and the cell is blank.
3. If a user overwrote a formula with a literal, the literal wins; warn that the derived formula is gone.
4. Do not treat `L13:L18` as stored stats; they are projections of `H13:H18`.
5. `T22`/`T23` are Mutable Campaign State that this template *also* formula-fills from POW. Caleb never typed over them. An existing Actor's current SAN/BP should be proposed, not silently replaced, when those cells are formula caches rather than literals.

## Canonical character fields

| Source cells | Observed type | Import meaning and constraints |
|---|---|---|
| `C5` (merge `C5:AA5`) | shared string or empty | Agent name. Caleb `Caleb Briggs ` (trailing space). Preserve exact text in provenance; canonical name may trim for matching. |
| `AB5` (merge `AB5:AQ5`) | shared string or empty | Profession, free text including rank. Caleb `Computer Scientist or Engineer`. No profession key. |
| `C7` (merge `C7:AA7`) | shared string or empty | Employer. Caleb `Shop Extra `. |
| `AB7` (merge `AB7:AQ7`) | shared string or empty | Nationality. Caleb `American `. |
| `C9` / `F9` / `I9` | booleans | Sex checkboxes F / M / other. Caleb has only `F9=true`. Diagnose multiple trues; map other+`K9` as free-text sex. |
| `K9` (merge `K9:O9`) | empty or string | Other-sex keyword. Unpopulated in both files. |
| `Q9` (merge `Q9:W10`) | shared string or empty | Age and DOB as one blob. Caleb `24 - 1985`. Do not split without a warning/remapping choice. |
| `X9` (merge `X9:AQ10`) | shared string or empty | Education and occupational history. Caleb `Please advise `. |
| `H13`…`H18` | numbers or empty | STR, CON, DEX, INT, POW, CHA. Caleb `8, 10, 14, 17, 10, 13` cached as `8.0`…`13.0`. Reject non-numeric non-empty values; warn rather than clamp. |
| `N13`…`N18` (merge `N13:X13` … `N18:X18`) | shared string or empty | Distinguishing features, one per stat. Caleb: STR `Frail`, DEX `Lithe`, INT `Gifted`, CHA `Explotative (Phishing)`; CON/POW empty. Empty is absence. |
| `N20` / `T20` | formula cache / input | HP maximum / current. See formula table. Caleb fills max `9`, leaves current empty. |
| `N21` / `T21` | formula cache / input | WP maximum / current. Caleb max `10`, current empty. |
| `N22` / `T22` | both formulas | SAN maximum (`99-Unnatural`) / current (`POW*5`). Caleb `99` / `50`. |
| `N23` / `T23` | input / formula | BP maximum column is unused on both files; current BP is computed. Caleb `T23=40`. |
| `AA13`…`AA18` (merge `AA13:AM13` …) | string or empty | Bond descriptions, six slots, position is not durable identity. Caleb three bonds: `Best Friend - Bruce`, `Brother - Daniel Briggs`, `Ex Grilfriend - Emily Carter `. |
| `AN13`…`AN18` (merge `AN13:AQ13` …) | number or empty | Bond scores. Caleb three `13.0` (CHA). |
| `C25` (merge `C25:X26`) | string or empty | Physical description blob. Previously unnamed in the cell map. Caleb `Please advise ` (same shared string as `X9`). |
| `AA20` (merge `AA20:AQ24`) | string or empty, may contain `\n` | Motivations and mental disorders as **one** blob, not a list. Previously unnamed. Caleb is a multiline `MOTIVATIONS;` block with five prose lines and no separate disorder field. |
| `AC26:AE26`, `AL26:AN26` | booleans | Adaptation Evidence: three Violence and three Helplessness incident marks. All false on both files. Labels: `AA26` `Violence`, `AF26` `adapted`, `AI26` `Helplessness`. `isAdapted` is not stored. |
| `C49` (merge `C49:AQ54`) | string or empty | Wounds and ailments blob. Empty on both files. Mutable Campaign State. |
| `X55` | boolean | First aid attempted since last injury. False on both files. Mutable. |
| `C58` (merge `C58:AQ65`) | string or empty | Armor and gear as one prose blob, not structured armor/weapon objects. Caleb is a long inventory including a pistol that is *also* listed in the weapon grid. Canonical import should create generic gear and warn before inferring item subtype. |
| `D68:AN74` | mixed | Seven weapon rows `(a)`–`(g)` at `C68:C74`. Columns: name `D`, skill % `J`, base range `N`, damage `T`, armor piercing `Z`, lethality `AE`, kill radius `AI`, ammo `AN` (each merged across the header spans on row 67). Caleb fills `(a)` Unarmed, `(b)` Pepper Spray Keychain, `(c)` SIG Sauer P232; `(d)`–`(g)` empty. Skill % may be a number (`40.0`, `20.0`) or text (`DEX X5`). |
| `C77` (merge `C77:Y89`) | string or empty | Personal details and notes. Caleb `Please advise - WHY DID DELTA GREEN CONTACT YOU - WHAT IS YOUR HOOK?`. |
| `Z77` (merge `Z77:AQ82`) | string or empty | Developments which affect home and family. Empty on both files. |
| `Z84:Z89` / `AI84:AI89` | string or empty | Special Training: six name / skill-or-stat pairs. Caleb row 84 `Data Mining ` / `Computer Science`. Do not use row index as durable identity. |
| `B93` (merge `B93:Y93`) | string or empty | Authorizing officer. Empty on both files. |
| `Z93` (merge `Z93:AQ93`) | string or empty | Agent signature. Empty on both files. |
| `K95`, `AL95` | numbers `315`, `112382` | Layout revision marks, not Agent data. Use for fingerprinting only. |
| `AR80` | string | Gycklarn attribution. Fingerprint only. |

## Skill-grid geometry

Rows `28:45`, three skills per row, columns:

| Slot | Fail | Title | Percent |
|---|---|---|---|
| Left | `C{row}` | `D{row}` (merge `D:Q`) | `R{row}` (merge `R:S`) |
| Middle | `T{row}` | `U{row}` (merge `U:AC`) | `AD{row}` (merge `AD:AE`) |
| Right | `AF{row}` | `AG{row}` (merge `AG:AO`) | `AP{row}` (merge `AP:AQ`) |

Title cells hold the printed skill name **and** the printed default in parentheses. Percent cells are empty on the blank sheet. Caleb writes a number (`50.0`, `80.0`) when the rating is overridden, and a multiline shared string when a typed family has several instances.

Read a Standard Skill as:

- identity = normalized title with the `(N%)` suffix stripped;
- proficiency = percent cell if non-empty, else the integer inside the title parentheses;
- failure = fail boolean when the checkbox exists.

Warn on title-text drift (the Machincery / Crimonology / Archeology spellings are this layout's labels, not canonical identifiers).

### Printed grid (blank titles)

| Row | Left | Middle | Right |
|---|---|---|---|
| 28 | Accounting (10%) | First Aid (10%) | Ride (10%) |
| 29 | Alertness (20%) | Forensics (0%) | Science (0%): |
| 30 | Anthropology (0%) | Heavy Machincery (10%) | *Science continuation* |
| 31 | Archeology (0%) | Heavy Weapons (0%) | Search (20%) |
| 32 | Art (0%): | History (10%) | SIGINT (0%) |
| 33 | *Art continuation* | HUMINT (10%) | Stealth (10%) |
| 34 | Artillery (0%) | Law (0%) | Surgery (0%) |
| 35 | Athletics (30%) | Medicine (0%) | Survival (10%) |
| 36 | Bureaucracy (10%) | Melee Weapons (30%) | Swim (20%) |
| 37 | Computer Science (0%) | Military Science (0%): | Unarmed Combat (40%) |
| 38 | Craft (0%): | *Military Science continuation* | Unnatural (0%) |
| 39 | *Craft continuation* | Navigate (10%) | *Foreign/other header* `AF39` |
| 40 | Crimonology (10%) | Occult (10%) | Foreign/other 1 |
| 41 | Demolitions (0%) | Persuade (20%) | Foreign/other 2 |
| 42 | Disguise (10%) | Pharmacy (0%) | Foreign/other 3 |
| 43 | Dodge (30%) | Pilot (0%): | Foreign/other 4 |
| 44 | Drive (20%) | *Pilot continuation* | Foreign/other 5 |
| 45 | Firearms (20%) | Psychotherapy (10%) | Foreign/other 6 |

Caleb numeric overrides (percent cells only): Accounting `R28=50.0`, SIGINT `AP32=60.0`, Stealth `AP33=30.0`, Law `AD34=40.0`, Bureaucracy `R36=70.0`, Computer Science `R37=80.0`, Persuade `AD41=40.0`. No fail mark is checked.

## Typed-family continuation

Typed families on this sheet are Art, Craft, Military Science, Science, and Pilot. Each uses the parent title cell (`… (0%):`) plus the next row as a continuation. Percent merges **span both rows**, so ratings are stored on the parent percent cell and types on the continuation title cell.

| Family | Title | Continuation title | Percent (spans both rows) | Fail on parent only |
|---|---|---|---|---|
| Science | `AG29` | `AG30` | `AP29` merge `AP29:AQ30` | `AF29` |
| Art | `D32` | `D33` | `R32` merge `R32:S33` | `C32` |
| Military Science | `U37` | `U38` | `AD37` merge `AD37:AE38` | `T37` |
| Craft | `D38` | `D39` | `R38` merge `R38:S39` | `C38` |
| Pilot | `U43` | `U44` | `AD43` merge `AD43:AE44` | `T43` |

Caleb demonstrates two families as multiline shared strings, not parallel cells:

- Science: `AG30` = `(Engineering)\n(Mathematics)`; `AP29` = `\n40%\n80%`.
- Craft: `D39` = `(Electrician)\n(Mechanic)\n(Microelectronics)`; `R38` = `\n30%\n30%\n60%`.

Parse by splitting on newlines, stripping surrounding parentheses and a trailing `%`, and pairing by index. A leading blank line in the percent string is padding, not a skill. Do not import a typed family with a blank continuation and empty/default percent as a canonical Custom Skill. Art, Military Science, and Pilot continuation cells are empty on both files; those paths are untested.

Foreign Languages and Other Skills (`AF39` label `Foreign Languages and Other Skills:`, slots `AF40:AP45`) are six Custom Skill rows with empty titles on the blank sheet. Same fail / title / percent triple as the main grid. Caleb leaves all six empty.

## Unmapped regions now pinned

The supplied cell map omitted three populated regions that the files already name:

1. **Distinguishing features** — header `N12` `DISTINGUISHING FEATURES`; values `N13:N18`. Confirmed on Caleb.
2. **Physical description** — labels `C24` `10.` + `D24` `PHYSICAL DESCRIPTION`; value merge `C25:X26`.
3. **Motivations and mental disorders** — labels `AA19` `12.` + `AB19` `MOTIVATIONS AND MENTAL DISORDERS`; value merge `AA20:AQ24`. One blob; disorders are not a separate field on this sheet.

`C46` is instructional chrome, not a data field.

## Normalization, validation, and diagnostics

1. **Block** if the workbook has no `Agent` sheet, or if the fingerprint (attribution + form numbers + merge count + formula set) misses more than one marker. A missing attribution *or* a missing form number should warn; missing both plus formula drift should refuse with “not a Gycklarn Agent sheet.”
2. **Preserve explicit values.** Empty percent, empty current HP/WP, and unchecked booleans are meaningful. Zero is explicit only when a numeric cache is actually `0` and the cell is not a blank-template formula cache for an empty stat (blank `N20`/`T22`/`L13:L18` cache `0` because inputs are empty — treat those as missing, not HP 0).
3. **Prefer `.xlsx` boolean cells.** On `.ods`, interpret `FALSE()`/`TRUE()` (or numeric 0/1 with those formulas) as the checkbox encoding.
4. **Do not discard unknown data.** Extra sheets, unexpected values in chrome cells, and unparsed weapon/gear prose go to `extensions.gycklarnDgSheet` with a path-specific warning.
5. **Preserve text exactly** in provenance, including trailing spaces and Caleb typos (`Ex Grilfriend`, `Explotative`, `algorthims`, `ôinvisibleö` mojibake in the gear blob).
6. **Cross-field diagnostics:** multiple sex checkboxes; bond score ≠ CHA; current HP/WP empty while maxima are calculated; `T22`/`T23` still formulas versus overwritten literals; typed continuation arity mismatch (types vs percents); Unnatural percent vs `N22` cache; gear blob that duplicates a weapon row; physical description reused as education text (Caleb).

## Fixture coverage and required additions

Caleb covers a named Agent, profession, employer, nationality, male checkbox, combined age/DOB, education, all six stats, four distinguishing features, three bonds at CHA, calculated HP/WP/SAN/BP maxima and formula current SAN/BP, empty current HP/WP, motivations blob, physical-description blob, gear blob, three weapons, one Special Training, notes, Science and Craft typed continuations, and several numeric skill overrides.

It does **not** cover:

- female/other sex, `K9` write-in, or multiple sex checks;
- fail marks, first-aid true, or any Violence/Helplessness incident;
- typed Art, Military Science, Pilot, and Foreign/other skills;
- wounds, home/family, officer, signature, or filled `N23`/`T20`/`T21`;
- overwritten SAN/BP formulas, non-empty Unnatural, or `N22` ≠ 99;
- a filled `.ods`, a second `.xlsx` revision, or a file that fails the fingerprint;
- checkbox-true encoding on `.ods`.

Add those fixtures before claiming those paths tested.

## Implementation consequence

The Gycklarn adapter should be a layout-fingerprinting, diagnostics-producing normalizer over one `Agent` sheet. Its supported edge is:

`Gycklarn DG sheet (xlsx, form 315 / 112382) -> canonical Agent schema 1.0.0`

`.ods` is the same layout with the encoding degradations above; support it as a sibling codec after the xlsx path, not as a second contract. This report does not claim reverse conversion, Google-live sync, historical Gycklarn revisions, or a mapping inventory. Those need independent tickets. Do not vendor the evidence binaries; keep them as local fixtures until a later ticket decides pinning policy.
