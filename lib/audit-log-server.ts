import { createAdminClient } from '@/lib/supabase-server';

export type AuditActor = { userId: string; email: string; role: string };
export type AuditEntry = {
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
};

export async function writeAuditEntry(actor: AuditActor, entry: AuditEntry) {
  try {
    const { error } = await createAdminClient().from('admin_audit_logs').insert({
      actor_user_id: actor.userId,
      actor_email: actor.email,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId || null,
      summary: entry.summary,
      details: { ...(entry.details || {}), actor_role: actor.role },
    });
    if (error) console.error('Failed to write audit entry', { code: error.code });
  } catch {
    // Audit logging must not make an already successful business operation fail.
    console.error('Failed to write audit entry');
  }
}
