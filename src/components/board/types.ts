/** The board payload shape, mirroring GET /api/boards/:id. */
export type BoardTask = {
  id: string
  title: string
  description: string | null
  dueDate: Date | string | null
  position: number
  columnId: string
  assignees: { id: string; name: string; email: string }[]
  commentCount: number
}

export type BoardColumn = { id: string; name: string; position: number; tasks: BoardTask[] }
export type Member = { id: string; name: string; email: string }
export type Board = {
  id: string
  name: string
  teamId: string
  members: Member[]
  viewerIsOwner: boolean
  columns: BoardColumn[]
}
