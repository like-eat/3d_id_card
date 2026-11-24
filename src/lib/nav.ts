export function useHashNavigate() {
  return (to: string) => {
    location.hash = to.startsWith('#') ? to : `#${to}`
    window.scrollTo(0, 0)
  }
}
