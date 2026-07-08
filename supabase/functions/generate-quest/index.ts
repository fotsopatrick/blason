// Edge function : génère une quête depuis une offre d'emploi.
// Provider configurable via env : AI_PROVIDER = "claude" | "deepseek".
// Les clés API ne quittent jamais le serveur.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Tu transformes des offres d'emploi en quêtes d'apprentissage gamifiées pour des étudiants en informatique.
À partir de l'offre fournie, produis UNIQUEMENT un objet JSON valide (aucun texte autour) avec ces clés :
{
  "title": "titre de quête avec une touche narrative fantasy légère (max 80 caractères)",
  "story": "accroche narrative d'une ou deux phrases situant la quête (ton fantasy léger, pas kitsch)",
  "description": "description concrète du projet à réaliser, 50 à 100 mots, orientée compétences réellement démontrables",
  "steps": [
    {"title": "étape 1", "description": "détail technique actionnable"},
    {"title": "étape 2", "description": "détail technique actionnable"},
    {"title": "étape 3", "description": "détail technique actionnable"}
  ],
  "skills": ["3 à 6 compétences techniques clés extraites de l'offre"],
  "resources": [{"label": "nom de la ressource", "url": "https://..."}],
  "difficulty": "beginner" | "intermediate" | "advanced" | "expert",
  "estimated_hours": nombre entier d'heures (1-200),
  "xp_reward": entier entre 100 et 1000, proportionnel à la difficulté et la durée
}
Exactement 3 steps. 2 à 4 resources réelles et pertinentes. Réponds en français.`;

type ProviderResult = { content: string };

async function callClaude(jobPosting: string): Promise<ProviderResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquante côté serveur");
  const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Offre d'emploi :\n\n${jobPosting}` }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return { content: data.content?.[0]?.text ?? "" };
}

async function callDeepSeek(jobPosting: string): Promise<ProviderResult> {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY manquante côté serveur");
  const model = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-chat";
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Offre d'emploi :\n\n${jobPosting}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content ?? "" };
}

function extractJson(raw: string): Record<string, unknown> {
  // Tolère les fences markdown éventuelles.
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Réponse IA sans JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    // Réservé aux comptes company/admin authentifiés.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["company", "admin"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Réservé aux comptes entreprise/école ou admin" }),
        { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const { job_posting } = await req.json();
    if (typeof job_posting !== "string" || job_posting.trim().length < 40) {
      return new Response(
        JSON.stringify({ error: "Offre d'emploi trop courte (min 40 caractères)" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const provider = (Deno.env.get("AI_PROVIDER") ?? "claude").toLowerCase();
    const result = provider === "deepseek"
      ? await callDeepSeek(job_posting)
      : await callClaude(job_posting);

    const quest = extractJson(result.content);

    // Garde-fous sur la sortie du modèle.
    const steps = Array.isArray(quest.steps) ? quest.steps.slice(0, 3) : [];
    if (steps.length !== 3) throw new Error("La génération n'a pas produit 3 étapes");
    const difficulty = DIFFICULTIES.includes(quest.difficulty as string)
      ? quest.difficulty
      : "intermediate";
    const xp = Math.min(1000, Math.max(100, Number(quest.xp_reward) || 300));
    const hours = Math.min(200, Math.max(1, Number(quest.estimated_hours) || 12));

    return new Response(
      JSON.stringify({
        title: String(quest.title ?? "").slice(0, 120),
        story: String(quest.story ?? ""),
        description: String(quest.description ?? ""),
        steps,
        skills: Array.isArray(quest.skills) ? quest.skills.slice(0, 8).map(String) : [],
        resources: Array.isArray(quest.resources) ? quest.resources.slice(0, 4) : [],
        difficulty,
        estimated_hours: hours,
        xp_reward: xp,
        provider,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-quest error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
