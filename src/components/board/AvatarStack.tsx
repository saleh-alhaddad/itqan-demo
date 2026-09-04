/**
 * Overlapping assignee avatars.
 *
 * Initials, not photographs: the data model stores a name and an email and nothing else, so
 * a photo would mean an upload feature (an open scope question in design.md's appendix).
 *
 * Replaces the comma-separated name list, which wrapped to a second line at two names and
 * broke the card's height rhythm — the stack is fixed-height whatever the count.
 */
export function AvatarStack({
  people, max = 3,
}: {
  people: { id: string; name: string }[]
  max?: number
}) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const overflow = people.length - shown.length

  return (
    <span
      className="flex items-center"
      // The stack is decorative repetition of a fact stated once, for assistive tech.
      role="img"
      aria-label={`Assigned to ${people.map((p) => p.name).join(', ')}`}
    >
      {shown.map((person) => (
        <span
          key={person.id}
          aria-hidden="true"
          title={person.name}
          className="ring-[var(--tint-surface)] bg-background text-tint-muted -ml-1.5 flex size-6 items-center justify-center rounded-full text-[10px] font-medium ring-2 first:ml-0"
        >
          {initialsOf(person.name)}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          aria-hidden="true"
          className="ring-[var(--tint-surface)] bg-background text-tint-muted -ml-1.5 flex size-6 items-center justify-center rounded-full text-[10px] font-medium ring-2"
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  )
}

/** First letters of the first and last word — "Ada Lovelace" → "AL", "Prince" → "P". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
