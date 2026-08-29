import { Provider } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

export const SupabaseProvider: Provider = {
  provide: 'SUPABASE_CLIENT',
  useFactory: () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('❌ .env 파일에 SUPABASE_URL 또는 SUPABASE_KEY가 없습니다!');
    }

    return createClient(supabaseUrl, supabaseKey);
  },
};