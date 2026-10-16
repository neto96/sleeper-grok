export type StarterSlotAssignment = {
  playerId: string;
  slot: string;
};

export function mapStarterIdsToSlots(
  starterIds: Array<string | number | null | undefined>,
  starterSlots: string[],
): StarterSlotAssignment[] {
  return starterIds.flatMap((rawPlayerId, index) => {
    const playerId = String(rawPlayerId ?? "");
    if (!playerId || playerId === "0") return [];

    return [{
      playerId,
      slot: starterSlots[index] ?? `S${index + 1}`,
    }];
  });
}
