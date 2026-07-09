# Other diagram types — syntax reference

## Class diagram (`classDiagram`)

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +String breed
        +bark() void
    }
    class Cat {
        +purr() void
    }

    Animal <|-- Dog : inherits
    Animal <|-- Cat : inherits
    Dog "1" --> "*" Toy : owns
```

### Visibility
`+` public · `-` private · `#` protected · `~` package

### Relationships
| Symbol | Meaning |
|--------|---------|
| `<\|--` | Inheritance (inherits from) |
| `*--` | Composition |
| `o--` | Aggregation |
| `-->` | Association |
| `--` | Link (solid) |
| `..\|>` | Realization |
| `..>` | Dependency |
| `..` | Link (dashed) |

Multiplicity: `"1"`, `"0..*"`, `"1..n"` — in quotes at the connection.

Namespaces (v10.2+):
```
namespace Backend {
    class Service
    class Repository
}
```

---

## ER diagram (`erDiagram`)

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT }|--|{ LINE_ITEM : "contained in"

    CUSTOMER {
        int id PK
        string first_name
        string last_name
        string email UK
    }
    ORDER {
        int id PK
        datetime created_at
        string status
        int customer_id FK
    }
```

### Cardinalities
| Left | Right | Meaning |
|------|-------|---------|
| `\|o` | `o\|` | Zero or one |
| `\|\|` | `\|\|` | Exactly one |
| `}o` | `o{` | Zero or many |
| `}\|` | `\|{` | One or many |

Attribute types: `int` · `string` · `float` · `boolean` · `date` · `datetime`
Keys: `PK` · `FK` · `UK`

---

## State diagram (`stateDiagram-v2`)

```mermaid
stateDiagram-v2
    [*] --> Active : start
    Active --> Paused : pause
    Paused --> Active : resume
    Active --> Stopped : stop
    Stopped --> [*]

    state Active {
        [*] --> Running
        Running --> Failed : exception
        Failed --> Running : retry
    }

    note right of Paused: resources released
```

Parallel states:
```
state Parallel {
    [*] --> A
    --
    [*] --> B
}
```

Choice:
```
state Branch <<choice>>
state Join <<join>>
```

---

## Gantt chart (`gantt`)

```mermaid
gantt
    title Project plan Q1 2026
    dateFormat YYYY-MM-DD
    excludes weekends

    section Planning
        Requirements    :done,    t1, 2026-01-05, 10d
        Concept         :done,    t2, after t1, 7d

    section Development
        Backend         :active,  t3, after t2, 21d
        Frontend        :         t4, after t2, 21d
        Integration     :crit,    t5, after t3, 7d

    section Wrap-up
        Testing         :crit,    t6, after t5, 10d
        Deployment      :milestone, t7, after t6, 0d
```

Status tags: `done` · `active` · `crit` · `milestone`
Date formats: `YYYY-MM-DD` · `DD/MM/YYYY` · `MM/DD/YYYY` · `YYYY/MM/DD`
Durations: `7d` · `2w` · `1m`

---

## Mindmap (`mindmap`)

```mermaid
mindmap
  root((Main topic))
    Area A
      ::icon(fa fa-book)
      Point 1
      Point 2
    Area B
      Sub-point B1
        Details
      Sub-point B2
    Area C
```

Shapes: `((round))` · `(rounded)` · `[square]` · `)cloud(` · `))bang((`
Icons: `::icon(fa fa-iconname)` (FontAwesome)

### ⚠ Mandatory rules for mindmaps

**1. ALWAYS quote free-text labels as `["..."]`.** Parentheses `( ) [ ] { }` in a plain label are parsed as shape syntax:

- `Failover (fallback)` → parses, but displays **only "fallback"** (the text before becomes the node ID)
- `Audio (.mp3, .wav) continued` → **parse error**, the entire diagram fails to render

Therefore: quote every label containing copied text (titles, sentences, file names) uniformly — do not decide case by case. Only self-chosen short branch names (1–3 words, no special characters) may stay plain.

**2. Group from ~8 entries.** The radial layouter collides with many flat sibling nodes — boxes overlap. Insert an intermediate level with 3–6 thematic branches:

```
mindmap
  root((Features))
    Provider & Infrastructure
      ["Provider failover on outage (fallback)"]
      ["Token price calculation"]
    Agents & Chains
      ["Agent builder"]
      ["Resolve A2A chain precedence"]
    UI & Usability
      ["Memory view as tree"]
      ["Pinning for chat history<br/>and projects"]
```

**3. Wrap labels longer than ~50 characters** with `<br/>` or shorten them.

**4. Optional** extra spacing: `%%{init: {"mindmap": {"padding": 16}}}%%` before `mindmap`.

---

## Pie chart (`pie`)

```mermaid
pie showData title Market share 2025
    "Product A" : 42.5
    "Product B" : 28.3
    "Product C" : 17.2
    "Other"     : 12.0
```

`showData` — display values in the chart (optional).

---

## Git graph (`gitGraph`)

```mermaid
gitGraph
   commit id: "Init"
   commit id: "Feature A"
   branch develop
   checkout develop
   commit id: "Dev 1"
   commit id: "Dev 2"
   branch feature/login
   checkout feature/login
   commit id: "Login UI"
   commit id: "Login API"
   checkout develop
   merge feature/login id: "Merge login"
   checkout main
   merge develop id: "Release 1.0" tag: "v1.0"
```

Types: `commit type: HIGHLIGHT` · `commit type: REVERSE` · `commit type: NORMAL`

---

## XY chart (`xychart-beta`)

```mermaid
xychart-beta
    title "Monthly revenue"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Revenue (€)" 0 --> 50000
    bar [12000, 18000, 15000, 22000, 19000, 31000]
    line [12000, 18000, 15000, 22000, 19000, 31000]
```

---

## Timeline (`timeline`)

```mermaid
timeline
    title Company history
    section Founding phase
        2018 : Founded
             : First employees
        2019 : Series A funding
    section Growth
        2021 : 50 employees
             : International expansion
        2023 : IPO
```

---

## Kanban (`kanban`)

```mermaid
kanban
    Todo
        id1[Collect requirements]
        id2[Create design]
    In progress
        id3[Develop backend]@{ assigned: 'Max' }
        id4[Develop frontend]@{ assigned: 'Anna' }
    Done
        id5[Concept finished]
```

---

## Quadrant chart (`quadrantChart`)

```mermaid
quadrantChart
    title Product portfolio
    x-axis Low growth --> High growth
    y-axis Low market share --> High market share
    quadrant-1 Stars
    quadrant-2 Question Marks
    quadrant-3 Dogs
    quadrant-4 Cash Cows
    Product A: [0.7, 0.8]
    Product B: [0.3, 0.6]
    Product C: [0.8, 0.3]
```

---

## Block diagram (`block-beta`)

```mermaid
block-beta
    columns 3
    A["Web"] B["API"] C["DB"]
    A --> B --> C
    D<["Load Balancer"]>(right)
    D --> A
```

---

## Architecture (`architecture-beta`)

For cloud/service architectures with icons. A flowchart with subgraphs is
usually the more robust choice — use `architecture-beta` only when its icon
style is explicitly wanted.

```mermaid
architecture-beta
    group api(cloud)[API]

    service db(database)[Database] in api
    service server(server)[Server] in api
    service disk(disk)[Storage] in api

    db:L -- R:server
    disk:T -- B:db
```

Icons: `cloud` · `database` · `disk` · `internet` · `server`
Edge ports: `L` / `R` / `T` / `B` (left/right/top/bottom).

---

## Theme configuration (all types)

```
%%{init: {"theme": "neutral"}}%%
```

Themes: `default` · `neutral` · `dark` · `forest` · `base`

Custom colors with the `base` theme:
```
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#ff9900", "primaryTextColor": "#fff"}}}%%
```
