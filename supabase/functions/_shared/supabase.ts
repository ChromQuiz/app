// V13: 浮動メジャー(@2)ではなくパッチ版まで固定する。上流の破壊的更新・供給網侵害の受動リスクを避ける。
// フロント(各 HTML の SRI 付き script)と同じ 2.110.1 に揃える。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';

function getSupabaseSecretKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed && typeof parsed === 'object') {
        const values = Object.values(parsed).filter((value): value is string => typeof value === 'string');
        const secret = values.find((value) => value.startsWith('sb_secret_')) || values[0];
        if (secret) return secret;
      }
    } catch {
      // Fall back to the legacy service role key below.
    }
  }

  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  throw new Error('Supabase secret key is not available');
}

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('SUPABASE_URL is not available');
  return createClient(url, getSupabaseSecretKey());
}
