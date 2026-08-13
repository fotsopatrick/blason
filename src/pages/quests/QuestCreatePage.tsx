import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/ui'
import { DIFFICULTY_LABELS } from '@/lib/format'
import type { GeneratedQuest, QuestDifficulty, QuestResource, QuestStep } from '@/lib/types'

const EMPTY_STEPS: QuestStep[] = [
  { title: '', description: '' },
  { title: '', description: '' },
  { title: '', description: '' },
]

export default function QuestCreatePage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'manual' | 'ai'>('manual')

  // Génération IA
  const [jobPosting, setJobPosting] = useState('')
  const [aiUsed, setAiUsed] = useState(false)

  // Formulaire commun
  const [title, setTitle] = useState('')
  const [story, setStory] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<QuestStep[]>(EMPTY_STEPS)
  const [skillsText, setSkillsText] = useState('')
  const [resources, setResources] = useState<QuestResource[]>([{ label: '', url: '' }])
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('intermediate')
  const [xpReward, setXpReward] = useState(300)
  const [hours, setHours] = useState(12)

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.functions.invoke('generate-quest', {
        body: { job_posting: jobPosting },
      })
      if (error) {
        // Tente d'extraire le message d'erreur renvoyé par la fonction.
        let detail = error.message
        try {
          const ctx = (error as { context?: Response }).context
          if (ctx) {
            const body = (await ctx.json()) as { error?: string }
            if (body.error) detail = body.error
          }
        } catch { /* garde le message par défaut */ }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)
      return data as GeneratedQuest
    },
    onSuccess: (quest) => {
      setTitle(quest.title)
      setStory(quest.story)
      setDescription(quest.description)
      setSteps(quest.steps.length === 3 ? quest.steps : EMPTY_STEPS)
      setSkillsText(quest.skills.join(', '))
      setResources(quest.resources.length > 0 ? quest.resources : [{ label: '', url: '' }])
      setDifficulty(quest.difficulty)
      setXpReward(quest.xp_reward)
      setHours(quest.estimated_hours)
      setAiUsed(true)
      toast.success(`Quête forgée par ${quest.provider} — relis et ajuste avant de publier ✨`)
    },
    onError: (err: Error) => toast.error(`Génération impossible : ${err.message}`),
  })

  const saveMutation = useMutation({
    mutationFn: async (status: 'published' | 'draft') => {
      const skills = skillsText.split(',').map((s) => s.trim()).filter(Boolean)
      const cleanResources = resources.filter((r) => r.label.trim() && r.url.trim())
      const cleanSteps = steps.map((s) => ({
        title: s.title.trim(),
        description: s.description.trim(),
      }))
      if (cleanSteps.some((s) => !s.title)) {
        throw new Error('Les 3 étapes doivent avoir un titre.')
      }
      if (skills.length === 0) {
        throw new Error('Ajoute au moins une compétence.')
      }
      const { data, error } = await api
        .from('quests')
        .insert({
          title: title.trim(),
          story: story.trim(),
          description: description.trim(),
          steps: cleanSteps,
          skills,
          resources: cleanResources,
          difficulty,
          xp_reward: xpReward,
          estimated_hours: hours,
          status,
          source: aiUsed ? 'ai' : 'manual',
          job_posting: aiUsed ? jobPosting : null,
          created_by: user!.id,
        })
        .select('id')
        .single()
      if (error) throw error
      return { id: data.id as string, status }
    },
    onSuccess: ({ id, status }) => {
      toast.success(status === 'published' ? 'Quête publiée sur le tableau ! 📜' : 'Brouillon sauvegardé.')
      navigate(`/app/quests/${id}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handlePublish = (e: FormEvent) => {
    e.preventDefault()
    saveMutation.mutate('published')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="⚒️ Forger une quête"
        subtitle="Transforme un besoin réel en projet formateur — à la main ou avec l'aide de la forge IA."
      />

      <div role="tablist" className="tabs tabs-box mb-6 w-fit">
        <button
          role="tab"
          className={`tab ${mode === 'manual' ? 'tab-active' : ''}`}
          onClick={() => setMode('manual')}
        >
          ✍️ Manuel
        </button>
        <button
          role="tab"
          className={`tab ${mode === 'ai' ? 'tab-active' : ''}`}
          onClick={() => setMode('ai')}
        >
          🤖 Depuis une offre d'emploi (IA)
        </button>
      </div>

      {mode === 'ai' && (
        <div className="card mb-6 border border-primary/20 bg-primary/5">
          <div className="card-body">
            <h2 className="card-title text-base">🤖 La forge IA</h2>
            <p className="text-sm text-base-content/70">
              Colle une offre d'emploi : l'IA en extrait un projet concret avec étapes,
              compétences, ressources et récompense d'XP. Tu pourras tout ajuster avant de publier.
            </p>
            <textarea
              className="textarea textarea-bordered min-h-40 w-full font-mono text-sm"
              placeholder="Colle ici l'offre d'emploi complète (poste, missions, compétences requises…)"
              value={jobPosting}
              onChange={(e) => setJobPosting(e.target.value)}
            />
            <div className="card-actions justify-end">
              <button
                className="btn btn-primary"
                disabled={generateMutation.isPending || jobPosting.trim().length < 40}
                onClick={() => generateMutation.mutate()}
              >
                {generateMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    La forge chauffe…
                  </>
                ) : (
                  '✨ Forger la quête'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handlePublish} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-medium">Titre de la quête</span>
            <input
              className="input input-bordered w-full"
              required
              minLength={3}
              maxLength={120}
              placeholder="Le Tableau de Bord du Seigneur des Ventes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 text-sm font-medium">
              Accroche narrative <span className="text-base-content/50">(optionnelle)</span>
            </span>
            <input
              className="input input-bordered w-full"
              maxLength={200}
              placeholder="Le seigneur marchand croule sous les parchemins de ventes…"
              value={story}
              onChange={(e) => setStory(e.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 text-sm font-medium">Description (50-100 mots)</span>
            <textarea
              className="textarea textarea-bordered min-h-24 w-full"
              required
              placeholder="Ce que l'équipe doit construire, avec quel niveau d'exigence…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div>
            <span className="label-text mb-2 block text-sm font-medium">Les 3 étapes techniques</span>
            <div className="flex flex-col gap-3">
              {steps.map((step, i) => (
                <div key={i} className="rounded-box border border-base-300 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="badge badge-primary badge-sm font-bold">{i + 1}</span>
                    <input
                      className="input input-bordered input-sm flex-1"
                      required
                      placeholder="Titre de l'étape"
                      value={step.title}
                      onChange={(e) =>
                        setSteps((s) => s.map((st, j) => (j === i ? { ...st, title: e.target.value } : st)))
                      }
                    />
                  </div>
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder="Détail actionnable"
                    value={step.description}
                    onChange={(e) =>
                      setSteps((s) => s.map((st, j) => (j === i ? { ...st, description: e.target.value } : st)))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="form-control">
            <span className="label-text mb-1 text-sm font-medium">Compétences (virgules)</span>
            <input
              className="input input-bordered w-full"
              required
              placeholder="React, TypeScript, Data-viz"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
            />
          </label>

          <div>
            <span className="label-text mb-2 block text-sm font-medium">Ressources</span>
            <div className="flex flex-col gap-2">
              {resources.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input input-bordered input-sm w-1/3"
                    placeholder="Nom"
                    value={r.label}
                    onChange={(e) =>
                      setResources((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <input
                    className="input input-bordered input-sm flex-1"
                    placeholder="https://…"
                    value={r.url}
                    onChange={(e) =>
                      setResources((rs) => rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => setResources((rs) => rs.filter((_x, j) => j !== i))}
                    aria-label="Supprimer la ressource"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {resources.length < 4 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-fit"
                  onClick={() => setResources((rs) => [...rs, { label: '', url: '' }])}
                >
                  + Ajouter une ressource
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">Difficulté</span>
              <select
                className="select select-bordered"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as QuestDifficulty)}
              >
                {(Object.keys(DIFFICULTY_LABELS) as QuestDifficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">Récompense XP</span>
              <input
                type="number"
                className="input input-bordered"
                min={10}
                max={5000}
                value={xpReward}
                onChange={(e) => setXpReward(Number(e.target.value))}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">Durée estimée (h)</span>
              <input
                type="number"
                className="input input-bordered"
                min={1}
                max={200}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="card-actions justify-end border-t border-base-200 pt-4">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate('draft')}
            >
              💾 Brouillon
            </button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                '📜 Publier la quête'
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
