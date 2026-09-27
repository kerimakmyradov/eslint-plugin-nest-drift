enum Kind { Circle = 'circle', Square = 'square' }
interface CircleShape { kind: Kind.Circle; radius: number }
interface SquareOptions { side: number; rounded: boolean }
interface Draft { id: string }
interface Archived { id: string; archivedAt: Date }

export const isCircle = (x: unknown): x is CircleShape => (x as { kind?: unknown })?.kind === Kind.Circle;
export const isSquare = (x: unknown): x is SquareOptions => (x as { kind?: unknown })?.kind === Kind.Square;
export const isDraft = (d: Draft | Archived): d is Draft => 'archivedAt' in d;
