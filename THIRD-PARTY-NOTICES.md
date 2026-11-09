# Third-Party Notices

Ontheia bundles third-party open-source components. This file lists the direct
dependencies whose licenses carry attribution requirements that apply to every
distributed build — including builds shipped under the commercial license
(see LICENSE-COMMERCIAL.md). All of them except elkjs are permissive: they may
be used in proprietary and commercial products, provided their copyright and
license notices are retained and reproduced with the distribution. elkjs is
dual-licensed under a weak-copyleft and a copyleft license; see its section
below.

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
| @modelcontextprotocol/client, @modelcontextprotocol/core (MCP TypeScript SDK) | host | MCP client for stdio and Streamable HTTP servers | Anthropic, PBC and contributors (parts remain under MIT during the project's relicensing) |
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

## Eclipse Public License 2.0 or GPL-3.0-or-later (elkjs)

elkjs is offered under either license, at the recipient's choice. Ontheia's
AGPL-licensed distribution uses the GPL-3.0-or-later option, which is
compatible with the AGPLv3. EPL-2.0 is a weak-copyleft license: elkjs may ship
unmodified as a separate module inside a larger work under other terms, but its
source must remain available and changes to elkjs itself stay under EPL-2.0.
**Builds shipped under the commercial license: review this component before
distribution** — either rely on the EPL-2.0 option with its source-availability
obligation, or build the web interface without ELK and set Mermaid's layout to
dagre.

| Component | Where | Purpose | Copyright |
|---|---|---|---|
| elkjs (Eclipse Layout Kernel) | webui, via Mermaid | Layout engine for Mermaid diagrams (default layout) | Kiel University and the ELK contributors |

The full license text ships with the package (`node_modules/elkjs/LICENSE.md`);
EPL-2.0: https://www.eclipse.org/legal/epl-2.0/ ·
GPL-3.0: https://www.gnu.org/licenses/gpl-3.0.html

## MIT License

All remaining direct dependencies (React, Fastify, Mermaid, i18next, pg,
Tailwind and others) are MIT-licensed. MIT requires that the copyright and
permission notice be retained in distributions; the notices ship inside the
respective packages.

## Keeping this file current

This file covers direct dependencies. When adding a dependency whose license is
neither MIT nor ISC, add it here before shipping — attribution obligations
apply per distributed build, not per release cycle.
