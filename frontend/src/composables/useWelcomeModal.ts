import { ref } from 'vue'

const WELCOME_SEEN_KEY = 'welcome_modal_seen'

// Singleton state — shared across all components
const showWelcome = ref(false)

export function useWelcomeModal() {
  /** Manually trigger the modal (from header dropdown, etc.). */
  function show() {
    showWelcome.value = true
  }

  /** Close + permanently mark as seen. */
  function dismiss() {
    showWelcome.value = false
    localStorage.setItem(WELCOME_SEEN_KEY, '1')
  }

  /** Show automatically on app mount if user has never seen it. */
  function showIfFirstTime() {
    if (!localStorage.getItem(WELCOME_SEEN_KEY)) {
      showWelcome.value = true
    }
  }

  return { showWelcome, show, dismiss, showIfFirstTime }
}
