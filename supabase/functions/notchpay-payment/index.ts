import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, reference, phone, amount, description } = await req.json();
    const NOTCHPAY_SECRET_KEY = Deno.env.get('NOTCHPAY_SECRET_KEY');

    if (!NOTCHPAY_SECRET_KEY) {
      throw new Error('La clé secrète Notch Pay est manquante');
    }

    if (action === 'collect') {
      // Initialize a new payment
      const payload = {
        amount: amount || 100,
        currency: "XAF",
        description: description || "Recherche Pharma-Garde",
        customer: {
          email: "client@pharmagarde.cm", // Obligatoire pour Notch Pay
          phone: phone, // Pass the phone number to pre-fill the checkout
        }
      };

      const response = await fetch('https://api.notchpay.co/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': NOTCHPAY_SECRET_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error("Notch Pay API Error:", data);
        throw new Error(data.message || data.error || 'Erreur lors de l\'initialisation du paiement');
      }

      return new Response(JSON.stringify({ 
        success: true, 
        reference: data.transaction.reference,
        authorization_url: data.authorization_url
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'status') {
      if (!reference) throw new Error('Reference manquante');

      // Check payment status
      const response = await fetch(`https://api.notchpay.co/payments/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': NOTCHPAY_SECRET_KEY,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors de la vérification du statut');
      }

      // Notch Pay status mapping: 'complete', 'pending', 'canceled', 'failed'
      let mappedStatus = 'PENDING';
      if (data.transaction.status === 'complete' || data.transaction.status === 'successful') {
        mappedStatus = 'SUCCESSFUL';
      } else if (data.transaction.status === 'canceled' || data.transaction.status === 'failed') {
        mappedStatus = 'FAILED';
      }

      return new Response(JSON.stringify({ 
        success: true,
        status: mappedStatus,
        raw_status: data.transaction.status
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error('Action non reconnue');
    }

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
