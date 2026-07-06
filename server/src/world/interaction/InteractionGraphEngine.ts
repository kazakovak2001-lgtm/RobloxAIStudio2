/**
 * InteractionGraphEngine.ts
 *
 * Tracks entity-to-entity interactions as a weighted graph.
 * Detects dominant behavioral loops and interaction patterns.
 */

export interface InteractionEdge {
  from: string;
  to: string;
  type: string;
  weight: number;
  lastTick: number;
}

export interface InteractionGraph {
  edges: InteractionEdge[];
  totalInteractions: number;
  dominantLoop: string | null;
  hotspots: string[]; // entity IDs with most interactions
}

export class InteractionGraphEngine {
  private edges: InteractionEdge[] = [];

  /**
   * Record an interaction between two entities.
   */
  recordInteraction(
    from: string,
    to: string,
    type: string,
    tick: number,
  ): void {
    const existing = this.edges.find(
      (e) => e.from === from && e.to === to && e.type === type,
    );
    if (existing) {
      existing.weight++;
      existing.lastTick = tick;
    } else {
      this.edges.push({ from, to, type, weight: 1, lastTick: tick });
    }
  }

  /**
   * Build and analyze the current interaction graph.
   */
  analyze(): InteractionGraph {
    const totalInteractions = this.edges.reduce((sum, e) => sum + e.weight, 0);

    // Find hotspots (entities with most interactions)
    const entityWeights = new Map<string, number>();
    for (const edge of this.edges) {
      entityWeights.set(
        edge.from,
        (entityWeights.get(edge.from) ?? 0) + edge.weight,
      );
      entityWeights.set(
        edge.to,
        (entityWeights.get(edge.to) ?? 0) + edge.weight,
      );
    }
    const sorted = Array.from(entityWeights.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const hotspots = sorted.slice(0, 5).map(([id]) => id);

    // Detect dominant loop (most repeated interaction pattern)
    const heaviestEdge = this.edges.reduce(
      (max, e) => (e.weight > (max?.weight ?? 0) ? e : max),
      this.edges[0],
    );
    const dominantLoop =
      heaviestEdge && heaviestEdge.weight > 5
        ? `${heaviestEdge.from} → ${heaviestEdge.to} (${heaviestEdge.type} ×${heaviestEdge.weight})`
        : null;

    return {
      edges: [...this.edges],
      totalInteractions,
      dominantLoop,
      hotspots,
    };
  }

  /**
   * Get interactions involving a specific entity.
   */
  getEntityInteractions(entityId: string): InteractionEdge[] {
    return this.edges.filter((e) => e.from === entityId || e.to === entityId);
  }

  /**
   * Reset the graph (for new simulation run).
   */
  reset(): void {
    this.edges = [];
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}
