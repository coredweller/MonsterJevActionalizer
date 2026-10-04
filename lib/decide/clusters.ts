/**
 * Player clusters for area options (research R6): connected groups of the DM's "clustered with"
 * relation, with every unclustered player as a singleton. No geometry is modelled (no grid in v1),
 * so an area option catches the whole cluster. Downed players stay in, and are counted.
 */
import { z } from "zod";
import type { Situation } from "../encounter/types";

export const ClusterSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  /** In situation order. Its length is the number an area option catches. */
  playerIds: z.array(z.string()).min(1),
});
export type Cluster = z.infer<typeof ClusterSchema>;

/**
 * Union-find over the situation's players. The relation is treated as symmetric; links to
 * players not in the situation, and to oneself, are ignored. Clusters are ordered by their first
 * player in situation order, and ids are `cluster_<index>` in that order.
 */
export function buildClusters(situation: Situation): Cluster[] {
  const ids = situation.players.map((p) => p.playerId);
  // Mutable union-find parents, local to this call.
  const parent = new Map<string, string>(ids.map((id) => [id, id]));

  const find = (id: string): string => {
    const up = parent.get(id);
    if (up === undefined || up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };

  for (const p of situation.players) {
    for (const other of p.clusteredWith) {
      if (other === p.playerId || !parent.has(other)) continue;
      const a = find(p.playerId);
      const b = find(other);
      if (a !== b) parent.set(b, a);
    }
  }

  // Walking ids in situation order fixes both the cluster order and the order inside each cluster.
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()].map((playerIds, index) => ({ id: `cluster_${index}`, playerIds }));
}
