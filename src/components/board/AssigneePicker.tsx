'use client'

import { Check } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { AvatarStack } from './AvatarStack'
import type { Member } from './types'

/**
 * Assign team members to a task.
 *
 * The list offers ONLY members of the board's team, so the UI cannot present a person the
 * server would reject (I4). That is a courtesy, not the boundary — the endpoint validates
 * containment itself and refuses the whole set if any id is not a member.
 */
export function AssigneePicker({
  members, assigned, disabled, onChange,
}: {
  members: Member[]
  assigned: Member[]
  disabled?: boolean
  onChange: (userIds: string[]) => void
}) {
  const assignedIds = new Set(assigned.map((a) => a.id))

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            {assigned.length === 0 ? 'Assign' : `${assigned.length} assigned`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Team members</DropdownMenuLabel>
          {members.map((person) => {
            const isAssigned = assignedIds.has(person.id)
            return (
              <DropdownMenuItem
                key={person.id}
                // Announce the state, not just the name — a tick is invisible to a screen reader.
                aria-label={`${isAssigned ? 'Unassign' : 'Assign'} ${person.name}`}
                onSelect={(e) => {
                  e.preventDefault()
                  const next = new Set(assignedIds)
                  if (isAssigned) next.delete(person.id)
                  else next.add(person.id)
                  onChange([...next])
                }}
              >
                <Check className={`size-4 ${isAssigned ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                <span className="truncate">{person.name}</span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <AvatarStack people={assigned} />
    </div>
  )
}
