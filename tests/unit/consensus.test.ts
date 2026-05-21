import { describe, it, expect } from "vitest";
import { RaftConsensus } from "../../src/swarm/consensus/RaftConsensus";

describe("RaftConsensus Protocol", () => {
  it("should register nodes and generate valid ed25519 identity keypairs", () => {
    const consensus = new RaftConsensus(0.66);
    const nodeIdentity = RaftConsensus.generateIdentity("node-1");

    expect(nodeIdentity.nodeId).toBe("node-1");
    expect(nodeIdentity.publicKey).toContain("PUBLIC KEY");
    expect(nodeIdentity.privateKey).toContain("PRIVATE KEY");

    consensus.registerNode(nodeIdentity.nodeId, nodeIdentity.publicKey);
  });

  it("should achieve consensus with Byzantine supermajority (>= 66%)", () => {
    const consensus = new RaftConsensus(0.66);

    const identities = [
      RaftConsensus.generateIdentity("node-1"),
      RaftConsensus.generateIdentity("node-2"),
      RaftConsensus.generateIdentity("node-3"),
    ];

    for (const identity of identities) {
      consensus.registerNode(identity.nodeId, identity.publicKey);
    }

    const proposal = consensus.createProposal("src/kernel/kernel.ts", "console.log('meow')", "node-1");
    expect(proposal.proposerId).toBe("node-1");

    // node-1 and node-2 vote approve (2 out of 3, ~66.7%)
    consensus.castVote(proposal.id, "node-1", true, identities[0].privateKey!);
    consensus.castVote(proposal.id, "node-2", true, identities[1].privateKey!);

    const check = consensus.checkConsensus(proposal.id);
    expect(check.reached).toBe(true);
    expect(check.approvals).toBe(2);
    expect(check.verifiedVotesCount).toBe(2);
  });

  it("should fail consensus if approvals are below threshold", () => {
    const consensus = new RaftConsensus(0.66);

    const identities = [
      RaftConsensus.generateIdentity("node-1"),
      RaftConsensus.generateIdentity("node-2"),
      RaftConsensus.generateIdentity("node-3"),
    ];

    for (const identity of identities) {
      consensus.registerNode(identity.nodeId, identity.publicKey);
    }

    const proposal = consensus.createProposal("src/kernel/kernel.ts", "console.log('meow')", "node-1");

    // Only node-1 votes approve (1 out of 3, ~33.3%)
    consensus.castVote(proposal.id, "node-1", true, identities[0].privateKey!);

    const check = consensus.checkConsensus(proposal.id);
    expect(check.reached).toBe(false);
    expect(check.approvals).toBe(1);
  });
});
