// Initialisation du client Supabase
const SUPABASE_URL = 'https://kcbcvdinuhckrpotngbw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kqCs9fGvxPvxOUfolarnPA_5N_d846O';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Helper: Initialize Supabase tables if they don't exist
 * Tables required:
 * - pharmacies (id, name, address, phone, whatsapp, email, lat, lng, status, hours, password_hash, services, created_at)
 * - requests (id, medicines, user_phone, user_lat, user_lng, radius, status, insurance_name, created_at)
 * - responses (id, request_id, pharmacy_id, pharmacy_name, status, medicines_status, created_at)
 */
async function ensureSupabaseReady() {
  try {
    // Test connection
    const { data, error } = await supabase.from('pharmacies').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.warn('Table pharmacies does not exist. Please create tables in Supabase dashboard.');
      return false;
    }
    return true;
  } catch (e) {
    console.error('Supabase connection error:', e);
    return false;
  }
}
