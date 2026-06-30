// supabase/functions/analyze-recipe/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Kein Rezepttext übergeben" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    const prompt = `Analysiere dieses Rezept und gib es als JSON zurück.
Übersetze ins Deutsche. Rechne Einheiten um (cup→Tasse, tbsp→EL, tsp→TL, oz/lb→g).
Antworte NUR mit JSON, kein Text davor oder danach, keine Markdown-Codefences:
{
  "title": "...",
  "emoji": "...",
  "category": "Pasta|Fleisch|Vegi|Fisch|Sonstiges",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "description": "...",
  "ingredients": [{"amount": 200, "unit": "g", "name": "..."}],
  "steps": ["Schritt 1...", "Schritt 2..."]
}

Rezepttext:
${text}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Anthropic API Fehler", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let responseText = data.content[0].text;
    responseText = responseText
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const recipeData = JSON.parse(responseText);

    return new Response(JSON.stringify(recipeData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Verarbeitungsfehler", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
