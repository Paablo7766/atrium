import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'

import { Bug, ImagePlus, Lightbulb, X } from 'lucide-react'

import { Button, Field, Modal, Textarea } from '@/components/ui'

import {

  FEEDBACK_IMAGE_ACCEPT,

  isAllowedFeedbackImageFile,

  isFeedbackAvailable,

  submitFeedback,

} from '@/lib/feedback'

import {

  FEEDBACK_MAX_IMAGE_BYTES,

  FEEDBACK_MAX_MESSAGE_LENGTH,

  type FeedbackDiagnostics,

  type FeedbackKind,

  type FeedbackRepro,

} from '../../lib/discordFeedback'

import { useT } from '@/lib/useI18n'

import { clsx } from 'clsx'



type Props = {

  open: boolean

  onClose: () => void

  onSent?: () => void

  context: FeedbackDiagnostics | null

}



export function FeedbackModal({ open, onClose, onSent, context }: Props) {

  const t = useT()

  const [kind, setKind] = useState<FeedbackKind>('bug')

  const [message, setMessage] = useState('')

  const [repro, setRepro] = useState<FeedbackRepro>('sometimes')

  const [screenshot, setScreenshot] = useState<File | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [privacyOk, setPrivacyOk] = useState(false)

  const [sending, setSending] = useState(false)

  const [errorKey, setErrorKey] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)



  const available = isFeedbackAvailable()



  useEffect(() => {

    if (!screenshot) {

      setPreviewUrl(null)

      return

    }

    const url = URL.createObjectURL(screenshot)

    setPreviewUrl(url)

    return () => URL.revokeObjectURL(url)

  }, [screenshot])



  function reset() {

    setKind('bug')

    setMessage('')

    setRepro('sometimes')

    setScreenshot(null)

    setPrivacyOk(false)

    setErrorKey(null)

    setSending(false)

  }



  function handleClose() {

    reset()

    onClose()

  }



  function setImageFile(file: File | null) {

    if (!file) {

      setScreenshot(null)

      setPrivacyOk(false)

      return

    }

    if (!isAllowedFeedbackImageFile(file)) {

      setErrorKey('image_invalid')

      return

    }

    setErrorKey(null)

    setScreenshot(file)

    setPrivacyOk(false)

  }



  function onPaste(e: ClipboardEvent) {

    const items = e.clipboardData?.items

    if (!items) return

    for (const item of items) {

      if (!item.type.startsWith('image/')) continue

      const file = item.getAsFile()

      if (file) {

        e.preventDefault()

        setImageFile(file)

        break

      }

    }

  }



  const needsPrivacy = !!screenshot

  const canSubmit =

    available &&

    !sending &&

    message.trim().length >= 3 &&

    !!context &&

    (kind !== 'bug' || repro) &&

    (!needsPrivacy || privacyOk)



  async function handleSubmit() {

    if (!canSubmit || !context) return

    setSending(true)

    setErrorKey(null)

    const result = await submitFeedback({

      kind,

      message,

      diagnostics: context,

      repro: kind === 'bug' ? repro : undefined,

      screenshot,

    })

    setSending(false)

    if (result.ok) {

      onSent?.()

      handleClose()

      return

    }

    setErrorKey(result.error)

  }



  return (

    <Modal

      open={open}

      onClose={handleClose}

      title={t('feedback.title')}

      subtitle={t('feedback.subtitle')}

      width="max-w-lg"

      footer={

        <div className="flex flex-col gap-2 w-full">

          {errorKey && (

            <p className="text-[12px] text-loss">

              {t(

                errorKey === 'unavailable'

                  ? 'feedback.errorUnavailable'

                  : errorKey === 'not_configured'

                    ? 'feedback.errorNotConfigured'

                    : errorKey === 'image_too_large'

                      ? 'feedback.errorImageTooLarge'

                      : errorKey === 'image_invalid'

                        ? 'feedback.errorImageInvalid'

                        : 'feedback.errorSend',

              )}

            </p>

          )}

          <div className="flex justify-end gap-2">

            <Button variant="ghost" onClick={handleClose} disabled={sending}>

              {t('feedback.cancel')}

            </Button>

            <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>

              {sending ? t('feedback.sending') : t('feedback.submit')}

            </Button>

          </div>

        </div>

      }

    >

      {!available ? (

        <p className="text-[13px] text-muted leading-relaxed">{t('feedback.errorUnavailable')}</p>

      ) : (

        <div className="flex flex-col gap-4" onPaste={onPaste}>

          <Field label={t('feedback.typeLabel')}>

            <div className="grid grid-cols-2 gap-2">

              <KindChoice

                active={kind === 'bug'}

                icon={<Bug size={16} />}

                label={t('feedback.typeBug')}

                onClick={() => setKind('bug')}

              />

              <KindChoice

                active={kind === 'suggestion'}

                icon={<Lightbulb size={16} />}

                label={t('feedback.typeSuggestion')}

                onClick={() => setKind('suggestion')}

              />

            </div>

          </Field>



          {kind === 'bug' && (

            <Field label={t('feedback.reproLabel')}>

              <div className="grid grid-cols-3 gap-2">

                {(['always', 'sometimes', 'once'] as const).map((id) => (

                  <button

                    key={id}

                    type="button"

                    onClick={() => setRepro(id)}

                    className={clsx(

                      'rounded-xl border px-2 py-2 text-[12px] font-medium transition-colors',

                      repro === id

                        ? 'border-accent/40 bg-accent/10 text-text'

                        : 'border-border-2 bg-surface-2 text-muted hover:text-text',

                    )}

                  >

                    {t(`feedback.repro.${id}`)}

                  </button>

                ))}

              </div>

            </Field>

          )}



          <Field label={t('feedback.messageLabel')}>

            <Textarea

              rows={5}

              value={message}

              onChange={(e) => setMessage(e.target.value)}

              placeholder={t('feedback.messagePlaceholder')}

              maxLength={FEEDBACK_MAX_MESSAGE_LENGTH}

            />

          </Field>



          <Field label={t('feedback.screenshotLabel')}>

            <input

              ref={fileRef}

              type="file"

              accept={FEEDBACK_IMAGE_ACCEPT}

              className="hidden"

              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}

            />

            {previewUrl ? (

              <div className="relative rounded-xl border border-border overflow-hidden bg-surface-2">

                <img src={previewUrl} alt="" className="max-h-40 w-full object-contain" />

                <button

                  type="button"

                  title={t('feedback.removeScreenshot')}

                  onClick={() => setImageFile(null)}

                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-bg/80 border border-border flex items-center justify-center text-muted hover:text-text"

                >

                  <X size={14} />

                </button>

              </div>

            ) : (

              <button

                type="button"

                onClick={() => fileRef.current?.click()}

                className="w-full rounded-xl border border-dashed border-border-2 bg-surface-2 px-3 py-4 text-[12px] text-muted hover:text-text hover:border-accent/30 transition-colors flex flex-col items-center gap-1.5"

              >

                <ImagePlus size={18} className="text-dim" />

                {t('feedback.screenshotHint')}

              </button>

            )}

          </Field>



          {needsPrivacy && (

            <label className="flex items-start gap-2.5 cursor-pointer text-[12px] text-muted leading-relaxed">

              <input

                type="checkbox"

                checked={privacyOk}

                onChange={(e) => setPrivacyOk(e.target.checked)}

                className="mt-0.5 rounded border-border-2"

              />

              <span>{t('feedback.privacyConfirm')}</span>

            </label>

          )}



          <p className="text-[11px] text-dim leading-relaxed">{t('feedback.metaHint')}</p>

        </div>

      )}

    </Modal>

  )

}



function KindChoice({

  active,

  icon,

  label,

  onClick,

}: {

  active: boolean

  icon: ReactNode

  label: string

  onClick: () => void

}) {

  return (

    <button

      type="button"

      onClick={onClick}

      className={clsx(

        'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors',

        active ? 'border-accent/40 bg-accent/10 text-text' : 'border-border-2 bg-surface-2 text-muted hover:text-text',

      )}

    >

      {icon}

      {label}

    </button>

  )

}


