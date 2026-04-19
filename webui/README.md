# WebUI Skeleton

## Stack
- Vite + React + TypeScript
- React Router für Navigation
- i18next (englisch als Startsprache)

## Projektbefehle
```bash
npm install
npm run dev
npm run build
npm run lint
```

## Struktur (Auszug)
```
src/
  App.tsx            # Shell mit Sidebar, Header, Combined Picker, Routes
  components/        # CombinedPicker, Sidebar, TracePanel
  routes/            # Platzhalteransichten für Chat, Agents, Tasks, Chains, Servers, Settings
  setupI18n.ts       # i18next-Konfiguration
mock/
  providers.json     # Demo-Provider/Modelle
  agents.json        # Demo-Agenten/Aufgaben
```

## Nächste Schritte
- API-Anbindung für Picker, Chats, Admin-Ansichten
- Zustandsspeicherung pro Chat (Picker-Auswahl, Konversation)
- Styling verfeinern (Tokens/Farben aus `theme.tokens.json`)
- Tests (Jest/RTL) ergänzen sobald Logik wächst
