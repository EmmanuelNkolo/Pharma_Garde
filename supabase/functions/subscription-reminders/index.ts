import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function : subscription-reminders
 * Exécutée périodiquement (cron quotidien) ou à la demande pour :
 * 1. Envoyer les rappels d'expiration à J-7, J-3, J-1
 * 2. Basculer les abonnements arrivés à échéance en statut 'expired' (ou 'grace' 48h)
 * 3. Journaliser les alertes dans `subscription_reminders_log`
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const stats = {
      checked: 0,
      j7_sent: 0,
      j3_sent: 0,
      j1_sent: 0,
      expired_marked: 0,
    };

    const { data: activeSubs, error } = await supabase
      .from('subscriptions')
      .select('*')
      .in('status', ['active', 'trial', 'grace']);

    if (error) throw error;

    for (const sub of (activeSubs || [])) {
      stats.checked++;
      const exp = new Date(sub.expires_at);
      const diffMs = exp.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // 1. Abonnement expiré
      if (diffMs <= 0) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'expired',
            reminder_expired_sent: true,
            updated_at: now.toISOString(),
          })
          .eq('id', sub.id);

        const roleTable = sub.subscriber_role === 'wholesaler'
          ? 'wholesalers'
          : sub.subscriber_role === 'pharmacy'
            ? 'pharmacies'
            : 'delegates';

        await supabase
          .from(roleTable)
          .update({ subscription_status: 'expired' })
          .eq('id', sub.subscriber_id);

        if (!sub.reminder_expired_sent) {
          await supabase.from('subscription_reminders_log').insert({
            subscription_id: sub.id,
            subscriber_id: sub.subscriber_id,
            subscriber_role: sub.subscriber_role,
            reminder_type: 'EXPIRED',
            message: `Votre abonnement Pharma-Garde Pro (${sub.plan_label || sub.plan_id}) est arrivé à expiration. Renouvelez-le en 1 clic par Mobile Money pour conserver tous vos accès.`,
          });
        }
        stats.expired_marked++;
        continue;
      }

      // 2. Rappel J-1 (<= 1 jour restant)
      if (diffDays <= 1 && !sub.reminder_j1_sent) {
        await supabase
          .from('subscriptions')
          .update({ reminder_j1_sent: true, updated_at: now.toISOString() })
          .eq('id', sub.id);

        await supabase.from('subscription_reminders_log').insert({
          subscription_id: sub.id,
          subscriber_id: sub.subscriber_id,
          subscriber_role: sub.subscriber_role,
          reminder_type: 'J-1',
          message: `⚠️ Dernier jour : Votre abonnement Pharma-Garde Pro expire dans moins de 24h (${exp.toLocaleDateString('fr-FR')}). Pensez à le renouveler pour éviter toute interruption.`,
        });
        stats.j1_sent++;
      }
      // 3. Rappel J-3 (<= 3 jours restants)
      else if (diffDays <= 3 && !sub.reminder_j3_sent) {
        await supabase
          .from('subscriptions')
          .update({ reminder_j3_sent: true, updated_at: now.toISOString() })
          .eq('id', sub.id);

        await supabase.from('subscription_reminders_log').insert({
          subscription_id: sub.id,
          subscriber_id: sub.subscriber_id,
          subscriber_role: sub.subscriber_role,
          reminder_type: 'J-3',
          message: `⏳ Votre abonnement Pharma-Garde Pro expire dans ${diffDays} jours (${exp.toLocaleDateString('fr-FR')}).`,
        });
        stats.j3_sent++;
      }
      // 4. Rappel J-7 (<= 7 jours restants)
      else if (diffDays <= 7 && !sub.reminder_j7_sent) {
        await supabase
          .from('subscriptions')
          .update({ reminder_j7_sent: true, updated_at: now.toISOString() })
          .eq('id', sub.id);

        await supabase.from('subscription_reminders_log').insert({
          subscription_id: sub.id,
          subscriber_id: sub.subscriber_id,
          subscriber_role: sub.subscriber_role,
          reminder_type: 'J-7',
          message: `📅 Rappel : Votre abonnement Pharma-Garde Pro arrive à échéance dans ${diffDays} jours.`,
        });
        stats.j7_sent++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('[subscription-reminders] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Internal Server Error'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
