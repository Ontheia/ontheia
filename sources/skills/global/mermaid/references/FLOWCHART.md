# Flowchart — complete syntax

## Basic structure

```
flowchart <direction>
    <node> <connection> <node>
```

Directions: `TD` / `TB` (top→down) · `BT` (bottom→up) · `LR` (left→right) · `RL`

---

## Node shapes

| Syntax | Shape |
|--------|-------|
| `id` | ID only, no label |
| `id[Text]` | Rectangle |
| `id(Text)` | Rounded corners |
| `id([Text])` | Stadium / pill |
| `id[[Text]]` | Subroutine |
| `id[(Text)]` | Cylinder / database |
| `id((Text))` | Circle |
| `id{Text}` | Diamond / decision |
| `id{{Text}}` | Hexagon |
| `id[/Text/]` | Parallelogram (right) |
| `id[\Text\]` | Parallelogram (left) |
| `id[/Text\]` | Trapezoid (wide top) |
| `id[\Text/]` | Trapezoid (wide bottom) |
| `id>Text]` | Asymmetric |

Extended shapes (v11.3+) via `@{ shape: ... }`:
`rect` · `rounded` · `stadium` · `subroutine` · `cylinder` · `circle` · `diamond` · `hexagon` · `parallelogram` · `trapezoid` · `double-circle` · `notch-rect` · `bow-rect` · `cross-circle` · `tag-rect` · `tag-doc` · `docs` · `multi-rect` · `multi-doc` · `bolt` · `card` · `braces` · `brace-l` · `brace-r` · `lean-r` · `lean-l`

---

## Connections

| Syntax | Rendering |
|--------|-----------|
| `A --> B` | Arrow (solid) |
| `A --- B` | Line without arrow |
| `A --label--> B` | Arrow with label |
| `A -- label --> B` | Arrow with label (alternative) |
| `A -.-> B` | Dashed arrow |
| `A -. label .-> B` | Dashed arrow with label |
| `A ==> B` | Thick arrow |
| `A == label ==> B` | Thick arrow with label |
| `A --o B` | Circle end |
| `A --x B` | Cross end |
| `A <--> B` | Bidirectional arrow |
| `A o--o B` | Circle on both ends |
| `A x--x B` | Cross on both ends |
| `A ~~~ B` | Invisible connection (layout helper) |

Chained syntax: `A --> B --> C --> D`

Multiple targets: `A --> B & C --> D`

---

## Subgraphs

```
subgraph ID [Title]
    direction LR
    A --> B
end

A --> subgraphID
```

Collapsible (v11+): `subgraph ID [Title]@{ collapsed: true }`

---

## Styling

Single node:
```
style A fill:#ff9900,stroke:#333,stroke-width:2px,color:#fff
```

Define and assign a class:
```
classDef highlight fill:#f96,stroke:#333
class A,B highlight
```

Shorthand: `A:::highlight --> B`

---

## Interactions

```
click A href "https://example.com" "Tooltip"
click A callback "Tooltip"
```

> **Not available in the Ontheia chat renderer** — it runs Mermaid with the
> strict security level, which disables click handlers and links. Use only
> for diagrams destined for other renderers (e.g. GitHub README files, where
> links work).

---

## Markdown in labels (v10.2+)

```
A["`**bold** and _italic_
second line`"] --> B
```

---

## Theme & config

```
%%{init: {"theme": "neutral", "flowchart": {"curve": "basis"}}}%%
flowchart LR
```

Themes: `default` · `neutral` · `dark` · `forest` · `base`

Curves: `basis` · `linear` · `cardinal` · `monotoneX` · `step` · `stepBefore` · `stepAfter`
