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
    const reqData = await req.json();
    const action = reqData.action;
    const reference = reqData.reference;
    const phone = reqData.phone;
    const amount = reqData.amount;
    const description = reqData.description;
    
    // On nettoie les clés (PowerShell rajoute parfois des guillemets invisibles)
    let NOTCHPAY_SECRET_KEY = Deno.env.get('NOTCHPAY_SECRET_KEY') || '';
    NOTCHPAY_SECRET_KEY = NOTCHPAY_SECRET_KEY.replace(/^["']|["']$/g, '').trim();

    let NOTCHPAY_PUBLIC_KEY = Deno.env.get('NOTCHPAY_PUBLIC_KEY') || '';
    NOTCHPAY_PUBLIC_KEY = NOTCHPAY_PUBLIC_KEY.replace(/^["']|["']$/g, '').trim();

    // La clé publique est utilisée pour initialiser les paiements (requis par Notch Pay)
    // La clé secrète est utilisée pour vérifier le statut des paiements
    const API_KEY = NOTCHPAY_PUBLIC_KEY || NOTCHPAY_SECRET_KEY;

    if (!API_KEY) {
      throw new Error('Les clés API Notch Pay sont manquantes');
    }

    if (action === 'collect') {
      // Étape 1: Initialiser le paiement
      const method = reqData.method; // 'om' ou 'momo'
      const payload = {
        amount: amount || 100,
        currency: "XAF",
        reference: "phg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        description: description || "Recherche Pharma-Garde",
        email: "client@pharmagarde.cm",
        phone: "+237" + phone,
      };

      console.log('[NotchPay] Initialisation du paiement...');

      const initResponse = await fetch('https://api.notchpay.co/payments', {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const initData = await initResponse.json();
      
      if (!initResponse.ok) {
        console.error("Notch Pay Init Error:", initData);
        throw new Error(initData.message || initData.error || 'Erreur lors de l\'initialisation du paiement');
      }

      const txReference = initData.transaction.reference;
      console.log('[NotchPay] Paiement initialisé:', txReference);

      // Étape 2: Compléter le paiement avec le canal Mobile Money (push USSD direct)
      const channel = method === 'momo' ? 'cm.mtn' : 'cm.orange';
      const completePayload = {
        channel: channel,
        data: {
          phone: "+237" + phone,
        }
      };

      console.log('[NotchPay] Envoi du push USSD via', channel, '...');

      const completeResponse = await fetch(`https://api.notchpay.co/payments/${txReference}`, {
        method: 'PUT',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(completePayload)
      });

      const completeData = await completeResponse.json();
      console.log('[NotchPay] Réponse complete:', JSON.stringify(completeData));

      if (!completeResponse.ok) {
        // Si le canal direct échoue, on retourne quand même la référence
        // pour que le frontend puisse rediriger vers le checkout classique
        console.error("Notch Pay Complete Error:", completeData);
        return new Response(JSON.stringify({ 
          success: true,
          reference: txReference,
          authorization_url: initData.authorization_url,
          direct_charge: false,
          error_detail: completeData.message || 'Canal mobile money non disponible'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Push USSD envoyé avec succès — le client va recevoir la notification sur son téléphone
      return new Response(JSON.stringify({ 
        success: true, 
        reference: txReference,
        direct_charge: true,
        message: 'Un message USSD a été envoyé sur votre téléphone. Veuillez entrer votre code PIN pour confirmer.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'status') {
      if (!reference) throw new Error('Reference manquante');

      // Check payment status
      const response = await fetch(`https://api.notchpay.co/payments/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': API_KEY,
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

    } else if (action === 'debug') {
      // Action de diagnostic — teste les deux clés
      const keyPrefix = NOTCHPAY_SECRET_KEY.substring(0, 12);
      const keyLength = NOTCHPAY_SECRET_KEY.length;
      
      let NOTCHPAY_PUBLIC_KEY = Deno.env.get('NOTCHPAY_PUBLIC_KEY') || '';
      NOTCHPAY_PUBLIC_KEY = NOTCHPAY_PUBLIC_KEY.replace(/^["']|["']$/g, '').trim();
      const pubKeyPrefix = NOTCHPAY_PUBLIC_KEY ? NOTCHPAY_PUBLIC_KEY.substring(0, 12) : 'NON DEFINIE';
      
      const testPayload = {
        amount: 100,
        currency: "XAF",
        email: "test@pharmagarde.cm",
        phone: "+237694929909",
        reference: "debug_" + Date.now(),
        description: "Debug test"
      };

      // Test 1: avec la clé secrète (sk.)
      const testSK = await fetch('https://api.notchpay.co/payments', {
        method: 'POST',
        headers: {
          'Authorization': NOTCHPAY_SECRET_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testPayload)
      });
      const dataSK = await testSK.json();

      // Test 2: avec la clé publique (pk.) si elle existe
      let dataPK = null;
      let statusPK = 0;
      if (NOTCHPAY_PUBLIC_KEY) {
        testPayload.reference = "debug_pk_" + Date.now();
        const testPK = await fetch('https://api.notchpay.co/payments', {
          method: 'POST',
          headers: {
            'Authorization': NOTCHPAY_PUBLIC_KEY,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(testPayload)
        });
        statusPK = testPK.status;
        dataPK = await testPK.json();
      }

      return new Response(JSON.stringify({ 
        diagnostic: true,
        secret_key_prefix: keyPrefix + '...',
        secret_key_length: keyLength,
        secret_key_status: testSK.status,
        secret_key_response: dataSK,
        public_key_prefix: pubKeyPrefix + '...',
        public_key_status: statusPK,
        public_key_response: dataPK,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error('Action non reconnue');
    }

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, // On retourne 200 pour que le frontend puisse lire l'erreur JSON
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
