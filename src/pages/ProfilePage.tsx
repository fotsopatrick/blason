import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { LoadingState, PageHeader, UserAvatar, XPBar } from '@/components/ui'
import { levelForXp, levelTitle } from '@/lib/levels'

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [careerGoal, setCareerGoal] = useState(profile?.career_goal ?? '')
  const [skillsText, setSkillsText] = useState(profile?.skills.join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  if (!profile) return <LoadingState />

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const skills = skillsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)
    const { error } = await api
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        bio: bio.trim(),
        career_goal: careerGoal.trim(),
        skills,
      })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      toast.error(`Échec de la sauvegarde : ${error.message}`)
      return
    }
    await refreshProfile()
    toast.success('Profil mis à jour ✨')
  }

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`
    const { error: uploadError } = await api.storage
      .from('avatars')
      .upload(path, file, { upsert: true })
    if (uploadError) {
      setUploading(false)
      toast.error(`Échec de l'upload : ${uploadError.message}`)
      return
    }
    const { data: { publicUrl } } = api.storage.from('avatars').getPublicUrl(path)
    const { error } = await api
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id)
    setUploading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    await refreshProfile()
    toast.success('Avatar mis à jour !')
  }

  const level = levelForXp(profile.xp)

  return (
    <div>
      <PageHeader
        title="Mon profil"
        subtitle="Ton identité d'aventurier·ère, visible sur ton portfolio public."
        actions={
          <Link to={`/u/${profile.username}`} className="btn btn-outline btn-sm">
            🌐 Voir mon portfolio public
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Carte identité */}
        <div className="card h-fit bg-base-100 shadow-sm">
          <div className="card-body items-center text-center">
            <UserAvatar url={profile.avatar_url} name={profile.display_name || profile.username} size="xl" />
            <button
              className="btn btn-outline btn-xs mt-2"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? <span className="loading loading-spinner loading-xs" /> : '📷 Changer d’avatar'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleAvatarUpload(file)
                e.target.value = ''
              }}
            />
            <h2 className="mt-2 text-lg font-bold">{profile.display_name || profile.username}</h2>
            <p className="text-sm text-base-content/60">@{profile.username}</p>
            <div className="badge badge-accent badge-sm mt-1">
              Nv. {level} · {levelTitle(level)}
            </div>
            <div className="badge badge-ghost badge-sm">{profile.role}</div>
            <div className="mt-3 w-full">
              <XPBar xp={profile.xp} />
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSave} className="card bg-base-100 shadow-sm lg:col-span-2">
          <div className="card-body gap-4">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">Nom affiché</span>
              <input
                className="input input-bordered w-full"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">Bio</span>
              <textarea
                className="textarea textarea-bordered min-h-24 w-full"
                placeholder="Qui es-tu, qu'aimes-tu construire ?"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">Objectif de carrière</span>
              <input
                className="input input-bordered w-full"
                placeholder="Ex. Développeuse full-stack en startup"
                value={careerGoal}
                onChange={(e) => setCareerGoal(e.target.value)}
                maxLength={120}
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">
                Compétences <span className="text-base-content/50">(séparées par des virgules, max 12)</span>
              </span>
              <input
                className="input input-bordered w-full"
                placeholder="React, TypeScript, Node.js"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
              />
            </label>

            <div className="card-actions justify-end">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : '💾 Sauvegarder'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
