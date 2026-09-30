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
  if (actor.role !== 'admin') return;
  const { error } = await createAdminClient().from('admin_audit_logs').insert({
    actor_user_id: actor.userId,
    actor_email: actor.email,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId || null,
    summary: entry.summary,
    details: entry.details || {},
  });
  if (error) console.error('Failed to write admin audit entry', error.message);
}
