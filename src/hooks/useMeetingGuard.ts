import { create } from 'zustand'

function isMeetingTime(): boolean {
  const now = new Date()
  return now.getDay() === 1 && now.getHours() >= 9 && now.getHours() < 12
}

interface MeetingGuardStore {
  pending: (() => void) | null
  guard: (action: () => void) => void
  confirm: () => void
  cancel: () => void
}

export const useMeetingGuard = create<MeetingGuardStore>((set, get) => ({
  pending: null,
  guard: (action) => {
    if (isMeetingTime()) {
      set({ pending: action })
    } else {
      action()
    }
  },
  confirm: () => {
    get().pending?.()
    set({ pending: null })
  },
  cancel: () => set({ pending: null }),
}))
