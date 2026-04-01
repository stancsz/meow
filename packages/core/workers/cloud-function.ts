import * as ff from '@google-cloud/functions-framework';
import { createClient } from '@supabase/supabase-js';
import { getKMSProvider } from '../security/kms';
import { loadSkillFromRef } from '../core/skill-loader';
import { OpenCodeExecutionEngine } from '../core/execution-engine';
import type { Task, ExecutionContext } from '../core/types';

export interface WorkerPayload {
  session_id: string;
  worker_id: string;
  task_config: Task;
  skill_ref?: string;
  credential_ciphertext?: string;
  user_id?: string;
  supabase_url: string;
  supabase_service_role_ciphertext: string;
}

export const cloudFunctionHandler = async (req: ff.Request, res: ff.Response) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const payload = req.body as WorkerPayload;
  const {
    session_id,
    worker_id,
    task_config,
    skill_ref,
    credential_ciphertext,
    user_id,
    supabase_url,
    supabase_service_role_ciphertext
  } = payload;

  if (!session_id || !worker_id || !task_config || !supabase_url || !supabase_service_role_ciphertext) {
    res.status(400).json({ error: 'Missing required payload parameters.' });
    return;
  }

  console.log(`[Worker] Booting for session: ${session_id}, worker: ${worker_id}`);

  try {
    const kmsProvider = getKMSProvider();

    // 1. Decrypt platform credentials (service role)
    const supabaseServiceRole = await kmsProvider.decrypt(supabase_service_role_ciphertext);
    const supabase = createClient(supabase_url, supabaseServiceRole);

    // 2. Check Idempotency (transaction_log)
    if (task_config.action_type === 'WRITE') {
      const { data: txLog, error: txError } = await supabase
        .from('transaction_log')
        .select('id')
        .eq('task_id', task_config.id)
        .maybeSingle();

      if (txError) {
        console.error('[Worker] Error checking idempotency:', txError);
      } else if (txLog) {
        console.log(`[Worker] Task ${task_config.id} already completed. Skipping.`);
        // Note: write an audit log if needed
        res.status(200).json({
          status: 'skipped',
          output: { message: 'Task skipped due to idempotency check.' }
        });
        return;
      }
    }

    // 3. Load Skill from Supabase (Sovereign Motherboard)
    let skillContent = 'Skill not specified.';
    const targetSkillRef = skill_ref || (task_config.skills && task_config.skills.length > 0 ? task_config.skills[0] : null);

    if (targetSkillRef) {
      try {
        const { data: skillData, error: skillError } = await supabase
          .from('skill_refs')
          .select('content')
          .eq('name', targetSkillRef)
          .maybeSingle();

        if (skillError) {
          throw new Error(skillError.message);
        }

        if (skillData) {
          skillContent = skillData.content;
        } else {
           // Fallback to local loader for testing/development if not in DB yet
           const skill = await loadSkillFromRef(targetSkillRef);
           skillContent = skill.content;
        }
      } catch (err: any) {
        console.error(`[Worker] Failed to load skill ${targetSkillRef}:`, err);
        throw new Error(`Failed to load skill: ${err.message}`);
      }
    }

    // 4. Decrypt User Credentials
    const decryptedCredentials: Record<string, string> = {
      supabase_url,
      supabase_service_role: supabaseServiceRole
    };

    if (credential_ciphertext) {
       try {
         const decryptedCred = await kmsProvider.decrypt(credential_ciphertext);
         // For simplistic binding, we just assign it to the first required credential.
         // In a robust implementation, this might map specific IDs if multiple are passed.
         if (task_config.credentials && task_config.credentials.length > 0) {
            decryptedCredentials[task_config.credentials[0]] = decryptedCred;
         }
       } catch (err: any) {
         console.error(`[Worker] Failed to decrypt user credential:`, err);
         throw new Error(`Failed to decrypt credential: ${err.message}`);
       }
    }

    // 5. Delegate Execution
    console.log(`[Worker] Delegating execution for task: ${task_config.id}`);
    const context: ExecutionContext = {
      credentials: decryptedCredentials,
      skillContent,
      sessionId: session_id,
      userId: user_id
    };

    const engine = new OpenCodeExecutionEngine();
    const output = await engine.execute(task_config, context);

    // 6. Log result to Sovereign Motherboard
    console.log(`[Worker] Task completed. Writing result to Supabase.`);

    // Log result
    const { error: insertError } = await supabase
      .from('task_results')
      .insert({
        session_id: session_id,
        worker_id,
        skill_ref: targetSkillRef || "none",
        status: "success",
        output: JSON.stringify(output)
      });

    if (insertError) {
      console.error('[Worker] Error inserting task result:', insertError);
    }

    // Log transaction for idempotency
    if (task_config.action_type === 'WRITE') {
       const { error: txInsertError } = await supabase
         .from('transaction_log')
         .insert({
            task_id: task_config.id,
            status: 'completed',
            result: JSON.stringify(output),
            created_at: new Date().toISOString()
         });

       if (txInsertError) {
          console.error('[Worker] Error inserting transaction log:', txInsertError);
       }
    }

    // Clean up credentials
    for (const key of Object.keys(decryptedCredentials)) {
      decryptedCredentials[key] = '';
    }

    res.status(200).json({
      status: 'success',
      output
    });

  } catch (error: any) {
    console.error('[Worker] Execution failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Internal server error during worker execution'
    });
  }
};

ff.http('cloudFunctionHandler', cloudFunctionHandler);
