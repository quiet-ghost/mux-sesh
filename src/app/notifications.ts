export function showTemporaryMessage(
  setMessage: (message: string) => void,
  message: string,
  timeout = 2000
) {
  setMessage(message)
  setTimeout(() => setMessage(''), timeout)
}

export function showTemporaryToast(
  setToastMessage: (message: string) => void,
  setToastVisible: (visible: boolean) => void,
  message: string,
  timeout = 5000
) {
  setToastMessage(message)
  setToastVisible(true)
  setTimeout(() => {
    setToastVisible(false)
  }, timeout)
}
