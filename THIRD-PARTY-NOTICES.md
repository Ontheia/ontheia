# Third-Party Notices

Ontheia bundles third-party open-source components. This file lists the direct
dependencies whose licenses carry attribution requirements that apply to every
distributed build — including builds shipped under the commercial license
(see LICENSE-COMMERCIAL.md). All of them are permissive: they may be used in
proprietary and commercial products, provided their copyright and license
notices are retained and reproduced with the distribution.

The overwhelming majority of dependencies are MIT-licensed. The components
below are listed individually because their terms differ from MIT.

## Apache License 2.0

Apache-2.0 permits commercial and proprietary use and includes an express
patent grant. When distributing a build (source or binary), section 4 requires
that recipients receive a copy of the license, that existing copyright, patent,
trademark and attribution notices are retained, and that modified files are
marked as changed. Apache-2.0 is one-way compatible with the AGPLv3: these
components may be combined with Ontheia's AGPL-licensed code, and they remain
under Apache-2.0 in any commercially licensed build.

| Component | Where | Purpose | Copyright |
|---|---|---|---|
| pdfjs-dist (PDF.js) | webui, host | PDF rendering in the artifact panel; PDF → Markdown conversion | Mozilla Foundation and contributors |
| prom-client | host | Prometheus metrics for `/metrics` | Simon Nord and contributors |

The full license text is distributed with each package
(`node_modules/<name>/LICENSE`) and is available at
https://www.apache.org/licenses/LICENSE-2.0

## ISC License

ISC is functionally equivalent to MIT: use, modification and distribution are
permitted provided the copyright notice and permission notice are retained.

| Component | Where | Purpose |
|---|---|---|
| lucide-react | webui | Icon set |
| jsonrepair | host | Repairing malformed JSON from model output |
| node-cron | host | Schedule execution |

## MIT License

All remaining direct dependencies (React, Fastify, Mermaid, i18next, pg,
Tailwind and others) are MIT-licensed. MIT requires that the copyright and
permission notice be retained in distributions; the notices ship inside the
respective packages.

## Keeping this file current

This file covers direct dependencies. When adding a dependency whose license is
neither MIT nor ISC, add it here before shipping — attribution obligations
apply per distributed build, not per release cycle.
