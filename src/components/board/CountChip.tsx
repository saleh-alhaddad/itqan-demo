/**
 * A small pill carrying an icon and a number, as the reference does for card metadata.
 *
 * The number alone is ambiguous to a screen reader — "12" beside an icon says nothing — so
 * the chip always carries a spelled-out label and hides the glyph.
 */
export function CountChip({
  icon, count, label,
}: {
  icon: React.ReactNode
  count: number
  label: string
}) {
  return (
    <span
      className="text-tint-muted bg-background/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] tabular-nums"
      aria-label={`${count} ${label}`}
    >
      <span aria-hidden="true" className="flex items-center">{icon}</span>
      {count}
    </span>
  )
}
