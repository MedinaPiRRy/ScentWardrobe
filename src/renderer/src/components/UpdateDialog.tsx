import { useEffect, useState } from 'react'
import type { UpdateInfo } from '@shared/types'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

const mb = (n: number) => `${Math.round(n / 1e6)} MB`

/**
 * "Check for updates". Opening it asks GitHub for the newest release (the app never does this on its own). On Windows the
 * new installer can be downloaded, verified and started from here; the data is backed up first and is never touched by the installer.
 */
export default function UpdateDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<{ status: 'checking' } | { status: 'error'; message: string } | { status: 'done'; info: UpdateInfo }>({ status: 'checking' })
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    let current = true
    window.api.update.check().then((r) => {
      if (current) setState(r.ok ? { status: 'done', info: r.data } : { status: 'error', message: r.message })
    })
    return () => {
      current = false
    }
  }, [])

  const install = async () => {
    setInstalling(true)
    setInstallError(null)
    const r = await window.api.update.install()
    if (r.ok) setStarted(true)
    else {
      setInstalling(false)
      setInstallError(r.message)
    }
  }

  return (
    <Modal title="Check for updates" onClose={onClose} wide>
      {state.status === 'checking' && <p className="text-sm text-cream/70" role="status">Asking GitHub for the newest version…</p>}
      {state.status === 'error' && (
        <p className="text-sm text-red-300" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'done' && !state.info.newer && (
        <p className="text-sm text-cream/80" role="status">
          You have the newest version ({state.info.current}).
        </p>
      )}
      {state.status === 'done' && state.info.newer && (
        <div className="space-y-3 text-sm">
          <p className="text-cream/80">
            Version <strong>{state.info.latest}</strong> is available. You have {state.info.current}.
          </p>
          {state.info.notes && <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-ink-600 bg-ink-900 p-3 font-sans text-xs text-cream/80">{state.info.notes}</pre>}
          {started ? (
            <p className="text-cream/80" role="status">
              The installer is starting and Scent Wardrobe will close. When it finishes, open the app again. Your data stays where it is.
            </p>
          ) : state.info.canInstall ? (
            <p className="text-xs text-cream/70">
              This downloads {state.info.installerName}
              {state.info.installerBytes ? ` (${mb(state.info.installerBytes)})` : ''}, checks it against the checksum GitHub published, saves a backup of your data, then starts the installer and closes the app.
              Windows may show an &ldquo;unknown publisher&rdquo; warning because the installer is not code-signed.
            </p>
          ) : (
            <p className="text-xs text-cream/70">This release cannot be installed from inside the app. Open the release page to download it.</p>
          )}
          {installError && (
            <p className="text-red-300" role="alert">
              {installError}
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        {state.status === 'done' && state.info.newer && !started && (
          <>
            <button className={ghostBtn} onClick={() => void window.api.update.openReleasePage()}>
              Open release page
            </button>
            {state.info.canInstall && (
              <button className={primaryBtn} disabled={installing} onClick={install}>
                {installing ? 'Downloading…' : 'Download and install'}
              </button>
            )}
          </>
        )}
        {!started && (
          <button className={ghostBtn} onClick={onClose} disabled={installing}>
            Close
          </button>
        )}
      </div>
    </Modal>
  )
}
