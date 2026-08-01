# Green Agent Creator sample-corpus research

## Question and pinned scope

This research asks whether Green Agent Creator (GAC) provides a public, consented, version-identifiable corpus suitable for durable adapter fixtures and batch contract testing. The code authority inspected was commit [`5c9e92d987f1251d62c172209fc53f8e8ac3372b`](https://github.com/greenagentcreator/charactercreator/tree/5c9e92d987f1251d62c172209fc53f8e8ac3372b). The deployed application is the project's [GitHub Pages app](https://greenagentcreator.github.io/charactercreator/).

The existing Caleb export was inspected read-only at `C:\Users\alge4\Downloads\delta_green_character_Caleb.json`. Its SHA-256 is `6af3eb7bede19085910a9ac373613d5d8d9c6a07f0bb7e06fc8290b900de4f10`. It remains the user-supplied golden fixture; it is not evidence of a community corpus or of all GAC shapes.

## Finding

GAC has an opt-in, publicly readable community library. Its records are intentionally shared and consented for public access and import through the application, so they are suitable for cautious structural observation. They are **not presently suitable for mirroring as a durable repository corpus**: records are not tied to a creator build or schema version, and the project publishes no explicit content-reuse or redistribution terms for community submissions. No community records were scraped, downloaded, or retained during this research.

The safe initial test corpus should therefore consist of:

1. Caleb and other characters deliberately supplied to this project by their owners;
2. deterministic synthetic variants generated from the pinned GAC source contract; and
3. ephemeral observation of the opt-in public library for structural discovery, with no payload retention; seek maintainer approval before automating at scale.

## What data is public, shared, or local

### Browser-local characters and drafts

Normal saved characters are stored in browser `localStorage`, as implemented by [`js/utils/storage.js`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/storage.js). Unfinished drafts are also stored locally by [`js/utils/unfinished-drafts.js`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/unfinished-drafts.js). The application's own privacy notice says saved Agents and drafts remain on the device unless the user shares them; it also warns users not to upload real personal data they do not want public ([English privacy text](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/i18n/en.js)).

The route used in the original example, `#app/view/local/<id>`, identifies browser-local state. It is not a remotely resolvable record and must never be enumerated or acquired without the browser owner's explicit export.

### Share links

Share links contain the complete character payload compressed into the URL fragment `#character=...`; creation and decoding are implemented in [`js/utils/sharing.js`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sharing.js). Because URL fragments are not a directory and possession of a link is the access mechanism, these are unlisted bearer objects, not a public corpus. A link supplied deliberately by its owner may be used as a consented fixture input, but links must not be guessed, harvested, or republished.

### Community library

The application offers a separate opt-in checkbox whose English copy says the Agent is shared when saved and can be unchecked to remain private ([`library_share_opt_in`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/i18n/en.js)). Upload removes local-only `sheetBaseline` and `skillFailMarks`, sanitizes and validates content, then writes a character document to Firestore. Reads expose only documents whose moderation status is `approved`. Pagination, filtering, single-record retrieval, upload, and import are implemented in [`js/utils/database.js`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/database.js).

Firestore rules make approved character documents publicly readable, disallow deletion, and constrain the accepted document shape ([`firestore.rules`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/firestore.rules)). The Firebase project and collection names are public client configuration in [`js/config/database.js`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/config/database.js). These mechanisms and the explicit upload choice demonstrate consent for public browsing and import inside the app. They do not by themselves state terms for mirroring or redistributing the collection in another repository.

## Provenance and stability limitations

Each community record can contain a Firestore document ID, upload and creation timestamps, language, profession metadata, preview values, and the character payload. It does **not** contain the GAC Git commit, deployed build ID, payload-schema version, uploader identity, content licence, or an explicit consent scope for third-party archival. The rules permit a `data` map but do not bind its inner structure to a version ([`firestore.rules`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/firestore.rules)).

Consequently:

- upload time cannot prove which creator version produced a payload;
- older and newer payload shapes may coexist;
- the app's sanitization and omission of local-only fields means a library record is not byte-equivalent to a normal JSON export;
- an approved record can later become pending after a report, so membership is mutable;
- query ordering and fallback behavior depend on Firestore indexes and current deployment configuration; and
- current deployed code may move beyond commit `5c9e92d`, making a live batch inherently unpinned.

The source repository contains no licence file at the pinned tree and the UI privacy/partnership text does not state community-content reuse terms ([pinned repository tree](https://github.com/greenagentcreator/charactercreator/tree/5c9e92d987f1251d62c172209fc53f8e8ac3372b)). This report is not legal advice, but absent an explicit grant the project should not redistribute user-created payloads merely because Firestore permits public reads.

## Safe acquisition and consent design

Before creating a durable community corpus, obtain written confirmation from the GAC maintainer covering automated retrieval, local retention, CI use, redistribution in this repository, and deletion/withdrawal handling. The existing community-library opt-in is sufficient for public access/import; a further application-level opt-in or published licence would make durable adapter/test-corpus reuse unambiguous.

A future consented export should add these server-authored fields:

- `payloadSchema` and `payloadSchemaVersion`;
- exact creator `buildId` or Git commit;
- stable public record ID;
- explicit licence/consent identifier and consent timestamp;
- moderation state and export timestamp; and
- optional withdrawal marker or documented immutable-public policy.

The maintainer should produce a versioned snapshot through an official export, not by exposing private administration credentials. Store it under `fixtures/upstream/green-agent-creator/<build>/community/` only when redistribution is authorized. Include a manifest with source record ID, declared build/schema, upload timestamp, acquisition timestamp, SHA-256, byte length, licence/consent identifier, and relative file name. Pin the snapshot hash and retain the applicable terms beside it. Never include email addresses, IP addresses, browser identifiers, unpublished share links, or administration metadata.

## Recommended batch contract-test operation

Implement one batch runner whose input is a manifest, not a hard-coded Firestore scraper. For each consented or synthetic JSON fixture it should:

1. verify the recorded SHA-256 before parsing;
2. detect and report source/build/schema provenance rather than assuming `5c9e92d`;
3. inventory JSON paths, value kinds, collection-entry shapes, optionality, and rule-expression forms;
4. run GAC-to-canonical conversion and structured diagnostics;
5. assert deterministic output independent of object-property order;
6. record structural fingerprints and mapping coverage without copying narrative values into reports; and
7. compare the observed union against the pinned source-derived contract, treating community-only fields as discoveries requiring review rather than schema authority.

Run all deliberately supplied and synthetic fixtures in normal CI. If the maintainer authorizes live observation, put it in a manually triggered, rate-limited research job: use only the public `getPublicCharacters`/`getPublicCharacterById` behavior, stop on errors, retain no payloads, redact character values, and publish only aggregate path/type counts. Live-library results must never gate releases because the population and deployed schema are mutable.

## Synthetic and owner-supplied coverage

Until a licensed snapshot exists, derive variants from the authoritative pinned source: profession choices, stat-generation modes, standard and custom skills, bonds, motivations, traumatic backgrounds, adaptations, items, notes, mutable sheet state, empty/partial drafts, and supported languages. Use pairwise or property-based generation to cover combinations without pretending generated examples are real community records. Preserve Caleb unchanged as the first owner-supplied golden input and add future exports only with an explicit statement that the contributor authorizes repository test use and redistribution.

This provides broad structural discovery now, while keeping the GAC source--not weakly versioned community content--as the contract authority. Corpus expansion is evidence work and does not block the first Foundry Agent-sheet prototype.
