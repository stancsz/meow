import crypto from "crypto";

export interface Proposal {
  id: string;
  filePath: string;
  contentHash: string;
  proposerId: string;
  timestamp: number;
  votes: Map<string, { signature: string; approve: boolean }>;
}

export interface NodeKey {
  nodeId: string;
  publicKey: string;
  privateKey?: string;
}

export class RaftConsensus {
  private nodes: Map<string, string> = new Map(); // nodeId -> publicKey
  private proposals: Map<string, Proposal> = new Map();
  private consensusThreshold: number; // e.g., 0.66 for Byzantine supermajority, or 0.5 for simple majority
  private nodeLastHeartbeat: Map<string, number> = new Map();

  constructor(consensusThreshold = 0.66) {
    this.consensusThreshold = consensusThreshold;
  }

  /**
   * Register a node with its public key.
   */
  public registerNode(nodeId: string, publicKey: string): void {
    this.nodes.set(nodeId, publicKey);
    this.nodeLastHeartbeat.set(nodeId, Date.now());
  }

  public updateNodeHeartbeat(nodeId: string): void {
    if (this.nodes.has(nodeId)) {
      this.nodeLastHeartbeat.set(nodeId, Date.now());
    }
  }

  public pruneOfflineNodes(timeoutMs: number): void {
    const now = Date.now();
    for (const [nodeId, lastSeen] of this.nodeLastHeartbeat.entries()) {
      if (now - lastSeen > timeoutMs) {
        console.warn(`[RaftConsensus] Node ${nodeId} offline (last seen ${now - lastSeen}ms ago). Pruning from consensus.`);
        this.nodes.delete(nodeId);
        this.nodeLastHeartbeat.delete(nodeId);
      }
    }
  }

  /**
   * Generates a new identity keypair for a node.
   */
  public static generateIdentity(nodeId: string): NodeKey {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    return {
      nodeId,
      publicKey,
      privateKey
    };
  }

  /**
   * Create a proposal for file change.
   */
  public createProposal(filePath: string, content: string, proposerId: string): Proposal {
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const proposal: Proposal = {
      id: proposalId,
      filePath,
      contentHash,
      proposerId,
      timestamp: Date.now(),
      votes: new Map()
    };
    this.proposals.set(proposalId, proposal);
    return proposal;
  }

  /**
   * Cast an ed25519-signed vote on a proposal.
   */
  public castVote(
    proposalId: string,
    voterId: string,
    approve: boolean,
    privateKey: string
  ): boolean {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return false;
    if (!this.nodes.has(voterId)) return false;

    this.updateNodeHeartbeat(voterId);

    // Sign the proposal data (id + contentHash + approve)
    const signData = Buffer.from(`${proposal.id}:${proposal.contentHash}:${approve}`);
    const signature = crypto.sign(null, signData, privateKey).toString("base64");

    proposal.votes.set(voterId, { signature, approve });
    return true;
  }

  /**
   * Verifies all cast votes and returns whether the proposal has achieved consensus.
   */
  public checkConsensus(proposalId: string): {
    reached: boolean;
    approvals: number;
    rejections: number;
    totalNodes: number;
    verifiedVotesCount: number;
  } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { reached: false, approvals: 0, rejections: 0, totalNodes: this.nodes.size, verifiedVotesCount: 0 };
    }

    let approvals = 0;
    let rejections = 0;
    let verifiedVotesCount = 0;

    for (const [voterId, vote] of proposal.votes.entries()) {
      const publicKey = this.nodes.get(voterId);
      if (!publicKey) continue;

      const signData = Buffer.from(`${proposal.id}:${proposal.contentHash}:${vote.approve}`);
      try {
        const signatureBuf = Buffer.from(vote.signature, "base64");
        const verified = crypto.verify(null, signData, publicKey, signatureBuf);
        if (verified) {
          verifiedVotesCount++;
          if (vote.approve) {
            approvals++;
          } else {
            rejections++;
          }
        }
      } catch {
        // Signature verification failed
      }
    }

    const totalNodes = this.nodes.size;
    const reached = totalNodes > 0 && (approvals / totalNodes) >= this.consensusThreshold;

    return {
      reached,
      approvals,
      rejections,
      totalNodes,
      verifiedVotesCount
    };
  }

  public getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }
}
