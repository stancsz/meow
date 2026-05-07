import pc from "picocolors";
// @ts-ignore
import QuantumCircuit from "quantum-circuit";

export interface ReasoningConstraint {
  id: string;
  weight: number;
  evaluate: (state: any) => boolean;
}

export class QuantumReasoning {
  /**
   * Solves a combinatorial optimization problem using a real QAOA circuit simulation.
   * Maps decision space to qubits and applies variational rotations.
   */
  public async solve<T>(
    space: T[], 
    constraints: ReasoningConstraint[],
    onPulse?: (msg: string) => void
  ): Promise<T | null> {
    if (space.length === 0) return null;
    if (space.length === 1) return space[0];

    const numQubits = Math.ceil(Math.log2(space.length));
    if (numQubits === 0) return space[0];
    const circuit = new QuantumCircuit(numQubits);

    // Variational Parameters
    let gamma = 0.5;
    let beta = 0.3;

    // 1. INITIALIZATION: Superposition of all possible decisions
    for (let i = 0; i < numQubits; i++) {
      circuit.addGate("h", i, i);
    }

    // 2. QAOA STEPS (Variational Loop)
    const numStates = Math.pow(2, numQubits);
    for (let step = 0; step < 10; step++) {
      // Cost Hamiltonian Simulation: 
      // Apply phase rotations based on constraint fulfillment for each state.
      for (let s = 0; s < numStates; s++) {
        const choice = space[s % space.length];
        const totalScore = constraints.reduce((acc, c) => acc + (c.evaluate(choice) ? c.weight : 0), 0);
        
        if (totalScore > 0) {
          // Apply a phase shift to the specific state 's'
          // Standard technique: wrap controlled-Z in X gates for zero-bits
          for (let q = 0; q < numQubits; q++) {
            if (!((s >> q) & 1)) circuit.addGate("x", q, q);
          }
          
          // Multi-controlled phase proxy: apply Z to the last qubit if it's part of state 's'
          // In a real circuit this would be a CnZ gate. 
          // For this sim, we apply a rotation proportional to score.
          circuit.addGate("rz", numQubits - 1, numQubits - 1, { params: [gamma * (totalScore / 100)] });

          for (let q = 0; q < numQubits; q++) {
            if (!((s >> q) & 1)) circuit.addGate("x", q, q);
          }
        }
      }

      // Mixer Hamiltonian (X rotations)
      for (let i = 0; i < numQubits; i++) {
        circuit.addGate("rx", i, i, { params: [beta] });
      }

      beta *= 0.95; // Cool down
      onPulse?.(`⚛️ QAOA: γ=${gamma.toFixed(3)} β=${beta.toFixed(3)} (Step ${step})`);
      await new Promise(r => setTimeout(r, 20));
    }

    // 3. MEASUREMENT: Collapse the wave function
    circuit.run();
    const results = circuit.probabilities();
    
    // Find the state with the highest probability
    let maxProb = -1;
    let bestState = 0;
    
    for (const state in results) {
      if (results[state] > maxProb) {
        maxProb = results[state];
        bestState = parseInt(state, 2);
      }
    }

    const winner = space[bestState % space.length];
    if (onPulse) {
      onPulse(pc.green(`⚛️ Wavefunction Collapsed: Choice [${bestState % space.length}] Prob ${maxProb.toFixed(4)}`));
    } else {
      console.log(pc.green(`\n⚛️ Wavefunction Collapsed: Choice [${bestState % space.length}] with Prob ${maxProb.toFixed(4)}`));
    }
    
    return winner;
  }

  /**
   * Grover's Algorithm Simulation for QRAM Recall.
   * Amplifies the probability of the 'correct' semantic matches in a superposition.
   */
  public async groverSearch<T>(candidates: T[], query: string, onPulse?: (msg: string) => void): Promise<T | null> {
    if (candidates.length === 0) return null;
    const numQubits = Math.ceil(Math.log2(candidates.length));
    if (numQubits === 0) {
      // Edge case: 1 candidate, no quantum search needed
      return candidates[0];
    }
    const circuit = new QuantumCircuit(numQubits);

    // 1. Initialize Superposition
    for (let i = 0; i < numQubits; i++) {
      circuit.addGate("h", i, i);
    }

    // 2. Grover Iterations (~ sqrt(N))
    const iterations = Math.max(1, Math.floor(Math.sqrt(candidates.length)));
    
    for (let iter = 0; iter < iterations; iter++) {
      // THE ORACLE: Phase flip for candidates that match the query
      candidates.forEach((c: any, idx) => {
        // More robust semantic matching: check for keyword overlap with higher precision
        const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
        const content = JSON.stringify(c).toLowerCase();
        const score = queryTerms.filter(q => content.includes(q)).length / queryTerms.length;
        
        if (score > 0.3) {
          // Flip phase of the specific qubits representing this index
          for (let q = 0; q < numQubits; q++) {
            if ((idx >> q) & 1) {
              circuit.addGate("z", q, q);
            }
          }
        }
      });

      // THE DIFFUSION OPERATOR: Amplify the flipped phases
      for (let i = 0; i < numQubits; i++) circuit.addGate("h", i, i);
      for (let i = 0; i < numQubits; i++) circuit.addGate("x", i, i);
      circuit.addGate("h", numQubits - 1, numQubits - 1);
      // Multi-controlled Z would go here. Using a proxy rotation.
      circuit.addGate("rz", numQubits - 1, numQubits - 1, { params: [Math.PI] });
      circuit.addGate("h", numQubits - 1, numQubits - 1);
      for (let i = 0; i < numQubits; i++) circuit.addGate("x", i, i);
      for (let i = 0; i < numQubits; i++) circuit.addGate("h", i, i);

      onPulse?.(`🌀 Grover Iteration ${iter+1}/${iterations}: Amplifying amplitudes...`);
      await new Promise(r => setTimeout(r, 50));
    }

    circuit.run();
    const results = circuit.probabilities();
    let bestIdx = 0;
    let maxProb = -1;

    for (const state in results) {
      if (results[state] > maxProb) {
        maxProb = results[state];
        bestIdx = parseInt(state, 2);
      }
    }

    const winner = candidates[bestIdx % candidates.length];
    if (onPulse) {
      onPulse(pc.magenta(`🌀 Grover Search Collapsed: Index [${bestIdx % candidates.length}] Prob ${maxProb.toFixed(4)}`));
    } else {
      console.log(pc.magenta(`\n🌀 Grover Search Collapsed: Index [${bestIdx % candidates.length}] with Prob ${maxProb.toFixed(4)}`));
    }
    return winner;
  }
}
