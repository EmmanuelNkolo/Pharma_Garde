// Initialisation du client Supabase
// (Nous utilisons les clés publiques configurées)

const SUPABASE_URL = 'https://kcbcvdinuhckrpotngbw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kqCs9fGvxPvxOUfolarnPA_5N_d846O'; // REMPLACER par la clé compléte

// Le SDK Supabase est chargé via CDN dans index.html et pharmacien.html
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
