export async function checkReadiness(
  probe: () => Promise<unknown>
): Promise<{ ready: boolean }> {
  try {
    await probe();
    return { ready: true };
  } catch {
    return { ready: false };
  }
}
