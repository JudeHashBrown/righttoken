export type SidebarNavItem = {
  path: string
  label: string
}

export function appendUserOperationsAfterProfile<T extends SidebarNavItem>(
  items: T[],
  allowed: boolean,
  operationItem: T
): T[] {
  if (!allowed) {
    return items
  }

  const profileIndex = items.findIndex((item) => item.path === '/profile')
  if (profileIndex < 0) {
    return [...items, operationItem]
  }

  return [
    ...items.slice(0, profileIndex + 1),
    operationItem,
    ...items.slice(profileIndex + 1)
  ]
}
