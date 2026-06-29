# 🏠 Haushaltsplan

Gemeinsamer Haushaltsplan als Progressive Web App (PWA) für zwei Personen.

## Features

- **Aufgaben** – Erstellen, zuweisen, abhaken mit Punktevergabe und Wiederholungsrhythmus
- **Kochplan** – Wochenansicht mit Rezeptzuweisung pro Tag
- **Einkaufen** – Einkaufsliste mit Kategorien
- **Rezepte** – Rezeptverwaltung inkl. PDF-Import mit KI-Analyse
- **Bilanz** – Punktestand und Ereignisverlauf
- **Echtzeit-Sync** via Supabase Realtime
- **Push-Benachrichtigungen** via Web Push / VAPID
- **Dark Mode**
- Installierbar auf iOS Safari und Android Chrome

## Stack

- Vanilla HTML / CSS / JavaScript (kein Framework, kein Build-Tool)
- [Supabase](https://supabase.com) als Backend
- [Netlify](https://netlify.com) als Hosting
- Supabase JS Client via CDN
- PDF.js via CDN (cdnjs.cloudflare.com)

## Umgebungsvariablen / Konfiguration

Die App benötigt kein `.env` – alle Werte sind im Code als Konstanten hinterlegt.

Für den Produktionseinsatz folgende Werte in `js/supabase-client.js` und `js/push.js` prüfen:

| Variable | Datei | Beschreibung |
|---|---|---|
| `SUPABASE_URL` | `js/supabase-client.js` | Supabase Projekt-URL |
| `SUPABASE_ANON_KEY` | `js/supabase-client.js` | Supabase Anon Key (öffentlich) |
| `VAPID_PUBLIC_KEY` | `js/push.js` | VAPID Public Key für Web Push |

## Deploy auf Netlify

1. Repository auf GitHub pushen (oder direkt per Drag & Drop auf Netlify)
2. Auf [netlify.com](https://netlify.com) neues Projekt erstellen
3. **Build command:** leer lassen (kein Build-Schritt)
4. **Publish directory:** `/` (Root)
5. Deploy starten

Die `netlify.toml` sorgt für korrekte Cache-Header für Service Worker und Manifest.

## Supabase Setup

### Edge Functions

Folgende Edge Functions müssen in Supabase deployed sein:

- **`send-push`** – Sendet Push-Benachrichtigungen an ein Profil
- **`daily-push`** – Täglicher Push um 8:00 Uhr (via pg_cron)
- **`analyze-recipe`** – Analysiert PDF-Text mit Claude und gibt strukturiertes Rezept zurück

### Supabase Secrets

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:...
CRON_SECRET=...
ANTHROPIC_API_KEY=...
```

### pg_cron (täglicher Push)

```sql
select cron.schedule(
  'daily-push',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/daily-push',
    headers := '{"Authorization": "Bearer <cron-secret>"}'::jsonb
  );
  $$
);
```

### analyze-recipe Edge Function (Beispiel)

```typescript
import Anthropic from 'npm:@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

Deno.serve(async (req) => {
  const { text } = await req.json();

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Analysiere diesen Rezepttext und gib ein strukturiertes JSON zurück mit den Feldern:
title, emoji, category (pasta/meat/vegi/fish/misc), portions, prep_time (Minuten), cook_time (Minuten),
description, ingredients (Array: {amount, unit, name}), steps (Array: strings), source_url.
Übersetze ins Deutsche. Einheiten: cup→ml, tbsp→EL, tsp→TL, oz→g, lb→g.
Antworte NUR mit dem JSON-Objekt, kein Markdown.

Text:
${text}`
    }]
  });

  const json = JSON.parse(msg.content[0].text);
  return Response.json({ recipe: json });
});
```

## Datenbankstruktur

| Tabelle | Felder |
|---|---|
| `profiles` | id, name, color, emoji, avatar_url, points |
| `tasks` | id, title, category, assigned_to, recurrence, points, due_date, done, alternating |
| `recipes` | id, title, emoji, category, portions, prep_time, cook_time, description, ingredients (jsonb), steps (jsonb), source_url |
| `mealplan` | id, date, recipe_id |
| `shopping` | id, name, category, done |
| `point_events` | id, profile_id, task_id, task_title, points, created_at |
| `push_subscriptions` | id, profile_id, subscription (jsonb) |

Storage Bucket: `avatars` (public)
