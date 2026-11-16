import React, { useEffect, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'

export default function PWAInstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    setInstalled(standalone)
    const onPrompt = event => { event.preventDefault(); setInstallPrompt(event) }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!installPrompt) {
      alert('To install C5 CycleHub, open your browser menu and choose “Install app” or “Add to Home Screen”. On iPhone, use Share → Add to Home Screen. Make sure you are using the deployed HTTPS website.')
      return
    }
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  if (installed) return <span className="pwa-installed"><Smartphone size={15} /> App installed</span>
  return <button type="button" className="pwa-install-btn" onClick={install}><Download size={15} /> Install app</button>
}
