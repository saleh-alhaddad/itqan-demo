/** The board payload shape, mirroring GET /api/boards/:id. */
/** As carried on the board payload: names only, deliberately — see lib/boards.ts. */
export type Member = { id: string; name: string }

export type BoardTask = {
  id: string
  title: string
  description: string | null
  dueDate: Date | string | null
  position: number
  columnId: string
  assignees: Member[]
  commentCount: number
}

export type BoardColumn = { id: string; name: string; position: number; tasks: BoardTask[] }
export type Board = {
  id: string
  name: string
  teamId: string
  members: Member[]
  viewerIsOwner: boolean
  columns: BoardColumn[]
}
