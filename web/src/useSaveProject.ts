import { useCallback, useState } from 'react'
import { api, isApiError, ApiError } from './api'

export function useSaveProject(onChanged: () => void, onError: (e: ApiError) => void) {
  const [saving, setSaving] = useState<string | null>(null)

  const save = useCallback(
    async (repo: string) => {
      setSaving(repo)
      try {
        await api.addProject(repo)
        onChanged()
      } catch (e) {
        onError(isApiError(e) ? e : new ApiError(0, String(e)))
      } finally {
        setSaving(null)
      }
    },
    [onChanged, onError]
  )

  return { saving, save }
}
