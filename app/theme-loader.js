'use client';

import {useEffect} from 'react';

import {createClient} from '@supabase/supabase-js';

const THEMES=new Set([

  'midnight',

  'stadium',

  'crimson',

  'royal'

]);

function applyTheme(themeKey){

  const theme=THEMES.has(themeKey)?themeKey:'midnight';

  document.documentElement.dataset.theme=theme;

  localStorage.setItem('cfb-theme',theme);

}

export default function ThemeLoader(){

  useEffect(()=>{

    let cancelled=false;

    const savedTheme=localStorage.getItem('cfb-theme');

    if(savedTheme)applyTheme(savedTheme);

    const supabase=createClient(

      process.env.NEXT_PUBLIC_SUPABASE_URL,

      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    );

    supabase.auth.getSession().then(async({data})=>{

      const user=data.session?.user;

      if(!user||cancelled)return;

      const {data:profile}=await supabase

        .from('user_profiles')

        .select('theme_key')

        .eq('user_id',user.id)

        .maybeSingle();

      if(!cancelled&&profile?.theme_key){

        applyTheme(profile.theme_key);

      }

    });

    return()=>{

      cancelled=true;

    };

  },[]);

  return null;

}
