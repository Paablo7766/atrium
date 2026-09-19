import { clsx } from 'clsx'
import logo from '@/assets/logo.png'

export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logo}
      alt="Atrium"
      width={size}
      height={size}
      draggable={false}
      className={clsx('shrink-0 select-none rounded-[22%] object-cover', className)}
    />
  )
}

export function BrandLockup({
  mark = 36,
  className,
}: {
  mark?: number
  className?: string
}) {
  const large = mark >= 48
  return (
    <div className={clsx('flex items-center', large ? 'gap-4' : 'gap-3', className)}>
      <BrandMark size={mark} />
      <div className={clsx('font-semibold tracking-tight leading-none', large ? 'text-[28px]' : 'text-[15px]')}>Atrium</div>
    </div>
  )
}
