function vibrate(pattern) {
  if (!('vibrate' in navigator)) return
  navigator.vibrate(pattern)
}

export function haptic_tap() {
  vibrate(12)
}

export function haptic_success() {
  vibrate([18, 35, 28])
}

export function haptic_warning() {
  vibrate([35, 40, 35])
}

export function haptic_error() {
  vibrate([45, 35, 45, 35, 60])
}

export function haptic_level_up() {
  vibrate([25, 35, 25, 35, 80])
}
