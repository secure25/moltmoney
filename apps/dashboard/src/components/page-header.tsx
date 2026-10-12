/**
 * Shared page-header: title + subtitle left, right-aligned actions.
 * Presentation only; actions are passed in by each page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Shared financial status badge colors (restrained semantics). */
export const statusBadgeClass: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  DECLINED: 'bg-red-50 text-red-700 border-red-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  BLOCKED: 'bg-red-50 text-red-700 border-red-200',
}

export function StatusBadge({ status }: { status: string }) {
  const cls = statusBadgeClass[status.toUpperCase()] ?? 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}
